import { constants } from 'node:fs';
import { posix } from 'node:path';
import { Readable, pipeline, type Transform } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createGunzip, gunzipSync } from 'node:zlib';
import tar from 'tar-stream';
import yauzl, { type Entry } from 'yauzl';
import { KIND, maxBytes, MINIFIED, type ArchiveFormat } from './formats.ts';
import { toParts, type Kind } from './parts.ts';

// The text files in an archive, and their parts. Run by archive.worker.ts in
// a thread of its own, so this and what it imports name each other's .ts.

export interface Limits {
  // entries looked at: past them the rest of the archive is left out
  entries: number;
  // bytes read of the files taken, unpacked, all of them together
  total: number;
  // bytes of a tar's entries, taken or not, as a tar is read through: past
  // them the rest is left out (a tar.gz is unpacked as it's read)
  unpacked: number;
  // a zip entry unpacked to more than this many times its packed size
  ratio: number;
}

export interface TextFile {
  // its path in the archive
  path: string;
  kind: Kind;
  bytes: Buffer;
}

// Folders of tools, libraries and builds rather than the course's: npm's
// packages, a Mac's resource forks, Visual Studio's build output, besides
// those whose names start with a dot (git's, an editor's, a virtualenv).
const LEFT_OUT = new Set(['node_modules', '__MACOSX', 'bin', 'obj']);
// longer than any file system takes; a part starts with its path, and this
// leaves it room
const MAX_PATH = 4096;

// What an entry is read as by its name alone, null to leave it out: a file
// plain-text takes by the extension of its path, the path's letters
// composed (NFC), as the parts' are. Archives inside aren't opened; entries
// named outside the archive (absolute, with a .. in them), folders, the
// folders above, and minified code are left out.
export function named(name: string) {
  if (yauzl.validateFileName(name) !== null || name.endsWith('/')) return null;
  const path = posix.normalize(name).normalize('NFC');
  const kind = KIND[posix.extname(path).toLowerCase()];
  if (!kind || MINIFIED.test(path) || path.length > MAX_PATH) return null;
  const folders = path.split('/');
  if (folders.some((dir) => dir.startsWith('.') || LEFT_OUT.has(dir)))
    return null;
  return { path, kind };
}

// Which entries of an archive are read, in turn: those named() takes, each
// up to its kind's limit and all of them up to limits.total, a file that
// won't fit left out and the next one looked at. A zip entry packed past
// limits.ratio (a zip bomb) is left out too, and past limits.entries
// entries or limits.unpacked bytes of a tar's, so is the rest.
export class Selection {
  private readonly limits: Limits;
  private seen = 0;
  private through = 0;
  private taken = 0;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  // false once past limits.entries, or limits.unpacked bytes of a tar's
  // entries, which it reads through whether it takes them or not
  more(tarred = 0) {
    this.through += tarred;
    return (
      ++this.seen <= this.limits.entries && this.through <= this.limits.unpacked
    );
  }

  // the path and kind to read an entry as, null to leave it out; a file
  // taken counts against the total
  take(name: string, size: number, packed = size) {
    const file = named(name);
    if (!file || size > maxBytes(file.kind)) return null;
    if (size > packed * this.limits.ratio) return null;
    if (this.taken + size > this.limits.total) return null;
    this.taken += size;
    return file;
  }
}

// The text files of an archive that a Selection takes, read. A gzip holds a
// tar when its name less the .gz ends in .tar, one file by that name
// otherwise.
export async function* textFiles(
  data: Buffer,
  format: ArchiveFormat,
  name: string,
  limits: Limits,
): AsyncGenerator<TextFile> {
  const selection = new Selection(limits);
  if (format === 'zip') return yield* zip(data, selection);
  if (format === 'tar') return yield* tarball(data, [], selection);
  const inner = name.replace(/\.gz$/i, '');
  if (format === 'tgz' || /\.tar$/i.test(inner))
    return yield* tarball(data, [createGunzip()], selection);
  // unpacked only when its name is one to read, and only up to its limit
  const file = named(inner);
  if (!file) return;
  const bytes = gunzipped(data, maxBytes(file.kind));
  if (bytes) yield { ...file, bytes };
}

// A file's parts, each starting with its path in the archive, so a page read
// or a search hit names it; one too long for a part goes on in the next,
// under its path again.
export function partsOf({ path, kind, bytes }: TextFile, max: number) {
  const head = `${path}\n\n`;
  return toParts(bytes, kind, max - head.length).map((part) => head + part);
}

// a symbolic link, by the Unix mode a zip keeps of it
const isLink = (entry: Entry) =>
  ((entry.externalFileAttributes >>> 16) & constants.S_IFMT) ===
  constants.S_IFLNK;

async function* zip(data: Buffer, selection: Selection) {
  // names decoded here, so that one named outside the archive leaves out
  // that entry instead of failing the archive
  const zipfile = await yauzl.fromBufferPromise(data, {
    decodeStrings: false,
  });
  for await (const entry of zipfile.eachEntry()) {
    if (!selection.more()) break;
    const name = yauzl.getFileNameLowLevel(
      entry.generalPurposeBitFlag,
      entry.fileNameRaw,
      entry.extraFields,
      false,
    );
    // encrypted, packed some way other than deflate, or a link
    if (!entry.canDecodeFileData() || isLink(entry)) continue;
    const file = selection.take(
      name,
      entry.uncompressedSize,
      entry.compressedSize,
    );
    // yauzl fails the read if it unpacks to other than that size
    if (file)
      yield {
        ...file,
        bytes: await buffer(await zipfile.openReadStreamPromise(entry)),
      };
  }
}

// A tar, through these first (a gzip's unpacking), read as it streams in.
// A failure on the way destroys extract with it, which the loop throws;
// breaking off the loop destroys extract, and the pipeline with it.
async function* tarball(
  data: Buffer,
  through: Transform[],
  selection: Selection,
) {
  const extract = tar.extract();
  pipeline([Readable.from([data]), ...through, extract], () => {});
  for await (const entry of extract) {
    const { name, type, size } = entry.header;
    if (!selection.more(size)) break;
    // links and folders aren't files
    const file = type === 'file' ? selection.take(name, size) : null;
    if (file) yield { ...file, bytes: await buffer(entry) };
    else entry.resume();
  }
}

// null past max
function gunzipped(data: Buffer, max: number) {
  try {
    return gunzipSync(data, { maxOutputLength: max });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE')
      return null;
    throw error;
  }
}
