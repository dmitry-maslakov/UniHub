import { constants } from 'node:fs';
import { pipeline, Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import yauzl, { type Entry } from 'yauzl';
import {
  readUpTo,
  type ExpandedEntry,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { named, Selection, type Limits } from './entries.js';
import { ARCHIVE } from './formats.js';

// a pipeline's failure reaches its last stream, which its reader throws
const done = () => {};

// The entries of an archive that a Selection takes. A gzip holds a tar when
// its name less the .gz ends in .tar, one file by that name otherwise.
export async function* entriesOf(
  input: ProcessorInput,
  limits: Limits,
): AsyncGenerator<ExpandedEntry> {
  const selection = new Selection(limits);
  // the hub hands over only what's in accepts, so it's one of these
  const format = ARCHIVE[input.matched];
  if (format === 'zip') return yield* zip(input, selection, limits);
  const inner = input.name.replace(/\.gz$/i, '');
  if (format !== 'gzip' || /\.tar$/i.test(inner))
    return yield* tarball(input, format !== 'tar', selection, limits);
  const path = named(inner);
  // unpacked as the hub stores it, up to what it stores of one content
  if (path)
    yield {
      path,
      content: async () =>
        pipeline(await input.content(), createGunzip(), done),
    };
}

// a symbolic link, by the Unix mode a zip keeps of it
const isLink = (entry: Entry) =>
  ((entry.externalFileAttributes >>> 16) & constants.S_IFMT) ===
  constants.S_IFLNK;

async function* zip(
  input: ProcessorInput,
  selection: Selection,
  limits: Limits,
): AsyncGenerator<ExpandedEntry> {
  const data = await readUpTo(await input.content(), limits.zip);
  if (!data) return;
  // names decoded here, so that one named outside the archive leaves out
  // that entry instead of failing the archive
  const zipfile = await yauzl.fromBufferPromise(data, {
    decodeStrings: false,
  });
  for await (const entry of zipfile.eachEntry()) {
    if (!selection.more()) break;
    // encrypted, packed some way other than deflate, or a link
    if (!entry.canDecodeFileData() || isLink(entry)) continue;
    const name = yauzl.getFileNameLowLevel(
      entry.generalPurposeBitFlag,
      entry.fileNameRaw,
      entry.extraFields,
      false,
    );
    const path = selection.take(
      name,
      entry.uncompressedSize,
      entry.compressedSize,
    );
    // yauzl fails the read if it unpacks to other than that size
    if (path)
      yield {
        path,
        size: entry.uncompressedSize,
        content: () => zipfile.openReadStreamPromise(entry),
      };
  }
}

// A tar read as it streams in, unpacked first when gzipped, failing past
// limits.unpacked bytes. A failure on the way destroys extract with it, which
// the loop throws; breaking off the loop destroys extract, and the pipeline
// with it.
async function* tarball(
  input: ProcessorInput,
  gzipped: boolean,
  selection: Selection,
  limits: Limits,
): AsyncGenerator<ExpandedEntry> {
  const extract = tar.extract();
  const source = await input.content();
  const bounded = upTo(limits.unpacked);
  if (gzipped) pipeline(source, createGunzip(), bounded, extract, done);
  else pipeline(source, bounded, extract, done);
  for await (const entry of extract) {
    if (!selection.more()) break;
    const { name, type, size } = entry.header;
    // links and folders aren't files
    const path = type === 'file' ? selection.take(name, size) : null;
    if (path) yield { path, size, content: async () => Readable.from(entry) };
    // what the hub didn't read
    entry.resume();
  }
}

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
