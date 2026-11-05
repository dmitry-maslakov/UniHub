import { posix } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { gunzipSync } from 'node:zlib';
import tar from 'tar-stream';
import yauzl from 'yauzl';
import { KIND, maxBytes, MINIFIED, type ArchiveFormat } from './formats.ts';
import { toParts, type Kind } from './parts.ts';

// The text files in an archive, and their parts. Run by archive.worker.ts in
// a thread of its own, so this and what it imports name each other's .ts.

export interface Limits {
  // entries looked at: past them the rest of the archive is left out
  entries: number;
  // bytes read of the files taken, unpacked, all of them together
  total: number;
  // what a gzip holds, unpacked (a .tar.gz's tar, a .gz's one file): past
  // it the archive has no text files
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

// Which entries of an archive are read, in turn: the files plain-text takes,
// by the extension of their path, each up to its kind's limit and all of
// them up to limits.total, a file that won't fit left out and the next one
// looked at. Archives inside it aren't opened; entries named outside it
// (absolute, with a .. in them), folders, and a zip entry packed past
// limits.ratio (a zip bomb) are left out, and past limits.entries entries
// so is the rest.
export class Selection {
  private readonly limits: Limits;
  private seen = 0;
  private taken = 0;

  constructor(limits: Limits) {
    this.limits = limits;
  }

  // false once past limits.entries
  more() {
    return ++this.seen <= this.limits.entries;
  }

  // the path and kind to read an entry as, null to leave it out; a file
  // taken counts against the total
  take(name: string, size: number, packed = size) {
    if (yauzl.validateFileName(name) !== null || name.endsWith('/'))
      return null;
    const path = posix.normalize(name);
    const kind = KIND[posix.extname(path).toLowerCase()];
    if (!kind || MINIFIED.test(path) || path.length > MAX_PATH) return null;
    const folders = path.split('/');
    if (folders.some((dir) => dir.startsWith('.') || LEFT_OUT.has(dir)))
      return null;
    if (size > maxBytes(kind) || size > packed * this.limits.ratio) return null;
    if (this.taken + size > this.limits.total) return null;
    this.taken += size;
    return { path, kind };
  }
}

// The text files of an archive that a Selection takes, read. A gzip holds
// one file, named as the archive less its .gz, or a tar when that name
// ends in .tar.
export async function* textFiles(
  data: Buffer,
  format: ArchiveFormat,
  name: string,
  limits: Limits,
): AsyncGenerator<TextFile> {
  const selection = new Selection(limits);
  if (format === 'zip') return yield* zip(data, selection);
  if (format === 'tar') return yield* tarball(data, selection);
  const unpacked = gunzipped(data, limits.unpacked);
  if (!unpacked) return;
  const inner = name.replace(/\.gz$/i, '');
  if (format === 'tgz' || /\.tar$/i.test(inner))
    return yield* tarball(unpacked, selection);
  const file = selection.take(inner, unpacked.length);
  if (file) yield { ...file, bytes: unpacked };
}

// A file's parts, each starting with its path in the archive, so a page read
// or a search hit names it; one too long for a part goes on in the next,
// under its path again.
export function partsOf({ path, kind, bytes }: TextFile, max: number) {
  const head = `${path}\n\n`;
  return toParts(bytes, kind, max - head.length).map((part) => head + part);
}

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
    // encrypted, or packed some way other than deflate
    if (!entry.canDecodeFileData()) continue;
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

async function* tarball(data: Buffer, selection: Selection) {
  const extract = tar.extract();
  extract.end(data);
  for await (const entry of extract) {
    if (!selection.more()) break;
    const { name, type, size } = entry.header;
    // links and folders aren't files
    const file = type === 'file' ? selection.take(name, size) : null;
    if (file) yield { ...file, bytes: await buffer(entry) };
    else entry.resume();
  }
}

// null past max, a gzip bomb among others
function gunzipped(data: Buffer, max: number) {
  try {
    return gunzipSync(data, { maxOutputLength: max });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE')
      return null;
    throw error;
  }
}
