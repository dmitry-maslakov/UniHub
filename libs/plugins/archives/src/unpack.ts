import { constants } from 'node:fs';
import { addAbortSignal, pipeline, Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import yauzl, { type Entry } from 'yauzl';
import { readUpTo, type Member, type UnpackerInput } from '@app/plugin-sdk';
import { ARCHIVE } from './formats.js';

const MiB = 1024 * 1024;

// What reading an archive may take, on top of the hub's limits on what it
// stores of the members, which are what stop a bomb: they count the bytes
// written, whatever a zip says or however its entries overlap.
export interface Limits {
  // bytes of a zip, which is read whole (its directory is at its end)
  zip: number;
  // bytes a tar unpacks to, what the hub skips and a gzip of zeros counted
  tar: number;
}

export const LIMITS: Limits = { zip: 100 * MiB, tar: 1024 * MiB };

// a pipeline's failure reaches its last stream, which its reader throws
const done = () => {};

// The regular files of an archive, each by the path it gives: the hub makes
// paths safe and leaves out what's noise, these are the format's rules.
export async function* membersOf(
  input: UnpackerInput,
  limits: Limits,
): AsyncGenerator<Member> {
  // the hub hands over only what's in accepts, so it's one of these
  const format = ARCHIVE[input.matched];
  // aborting destroys the archive's stream, and what unpacks it with it
  const source = addAbortSignal(input.signal, await input.content());
  if (format === 'zip') return yield* zip(source, input.signal, limits);
  const inner = input.name.replace(/\.gz$/i, '');
  if (format !== 'gzip' || /\.tar$/i.test(inner))
    return yield* tarball(source, format !== 'tar', limits);
  // its one file, unpacked as far as the hub stores it
  yield { path: inner, content: pipeline(source, createGunzip(), done) };
}

// a symbolic link, by the Unix mode a zip made on Unix keeps of it
const UNIX = 3;
const isLink = (entry: Entry) =>
  entry.versionMadeBy >>> 8 === UNIX &&
  ((entry.externalFileAttributes >>> 16) & constants.S_IFMT) ===
    constants.S_IFLNK;

// the name's encoding is UTF-8 (bit 11), or an Info-ZIP Unicode Path field
// gives it in UTF-8
const UTF8_FLAG = 0x800;
const UNICODE_PATH = 0x7075;
const utf8 = new TextDecoder('utf-8', { fatal: true });

// A name as the zip encodes it, not checked: one named out of it is the
// hub's to leave out, not a failure of the zip. macOS writes UTF-8 without
// saying so; CP437 past ASCII hardly ever reads as UTF-8, so a name that
// does is taken as it, the rest as CP437, as the zip format has it.
function nameOf(entry: Entry) {
  const said =
    entry.generalPurposeBitFlag & UTF8_FLAG ||
    entry.extraFields.some(({ id }) => id === UNICODE_PATH);
  if (!said)
    try {
      return utf8.decode(entry.fileNameRaw);
    } catch {
      // CP437, then
    }
  return yauzl.getFileNameLowLevel(
    entry.generalPurposeBitFlag,
    entry.fileNameRaw,
    entry.extraFields,
    false,
  );
}

async function* zip(
  source: Readable,
  signal: AbortSignal,
  limits: Limits,
): AsyncGenerator<Member> {
  const data = await readUpTo(source, limits.zip);
  if (!data) throw new Error(`a zip past ${limits.zip} bytes isn't read`);
  const zipfile = await yauzl.fromBufferPromise(data, {
    decodeStrings: false,
  });
  for await (const entry of zipfile.eachEntry()) {
    // the hub can't stop the entries left out here, millions of them maybe
    signal.throwIfAborted();
    const path = nameOf(entry);
    // a folder, a link, encrypted, or packed other than stored or deflated.
    // yauzl fails the zip at an entry of strong encryption, which it can't
    // even list
    if (path.endsWith('/') || isLink(entry) || !entry.canDecodeFileData())
      continue;
    // yauzl fails the read if it unpacks to other than that size
    yield {
      path,
      size: entry.uncompressedSize,
      content: await zipfile.openReadStreamPromise(entry),
    };
  }
}

// A tar read as it streams in, unpacked first when gzipped, failing past
// limits.tar bytes. A failure on the way destroys extract with it, which the
// loop throws; breaking off the loop destroys extract, the pipeline with it.
async function* tarball(
  source: Readable,
  gzipped: boolean,
  limits: Limits,
): AsyncGenerator<Member> {
  const extract = tar.extract();
  const bounded = upTo(limits.tar);
  if (gzipped) pipeline(source, createGunzip(), bounded, extract, done);
  else pipeline(source, bounded, extract, done);
  for await (const entry of extract) {
    const { name, type, size } = entry.header;
    // links, folders and devices aren't files
    if (type === 'file' || type === 'contiguous-file')
      yield { path: name, size, content: shielded(entry) };
    // what the hub left of it
    entry.resume();
  }
}

// tar-stream ends the whole tar, with no error, when an entry is destroyed,
// as the hub does with a member it lets go of partway: the hub reads the
// entry through an iterator it can't close, and tarball() skips the rest
const shielded = (entry: AsyncIterable<unknown>) => {
  const chunks = entry[Symbol.asyncIterator]();
  return Readable.from({
    [Symbol.asyncIterator]: () => ({ next: () => chunks.next() }),
  });
};

// a stream's bytes, failing past max: a gzip of zeros would unpack for long
// without a tar entry to count
const upTo = (max: number) =>
  async function* (chunks: AsyncIterable<Buffer>) {
    let size = 0;
    for await (const chunk of chunks) {
      size += chunk.length;
      if (size > max) throw new Error(`unpacks past ${max} bytes`);
      yield chunk;
    }
  };
