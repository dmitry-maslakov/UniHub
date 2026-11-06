import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import tar, { type Header } from 'tar-stream';
import yazl from 'yazl';
import { ContentHash, type UnpackerInput } from '@app/plugin-sdk';
import { ArchivesUnpacker } from './archives.unpacker.js';
import { LIMITS, membersOf, type Limits } from './unpack.js';

// these files deflated, a name ending in / as a folder; then symbolic links
// to where they point
async function zipOf(
  files: Record<string, string | Buffer>,
  links: Record<string, string> = {},
) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    if (name.endsWith('/')) zip.addEmptyDirectory(name);
    else zip.addBuffer(Buffer.from(content), name);
  for (const [name, target] of Object.entries(links))
    zip.addBuffer(Buffer.from(target), name, { mode: 0o120777 });
  zip.end();
  return buffer(zip.outputStream);
}

// these files, then entries of other types
async function tarOf(
  files: Record<string, string>,
  others: (Partial<Header> & Pick<Header, 'name'>)[] = [],
) {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(files))
    pack.entry({ name }, content);
  for (const header of others) pack.entry(header);
  pack.finalize();
  return buffer(pack);
}

// as the hub hands it over: matched by its extension
const input = (
  name: string,
  data: Buffer,
  signal = new AbortController().signal,
): UnpackerInput => ({
  name,
  mime: null,
  matched: extname(name).toLowerCase(),
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () => Readable.from([data]),
  signal,
});

// the members with what they hold, read whole as the hub stores them
async function read(name: string, data: Buffer, limits: Limits = LIMITS) {
  const members = [];
  for await (const { path, size, content } of membersOf(
    input(name, data),
    limits,
  ))
    members.push({ path, size, text: (await buffer(content)).toString() });
  return members;
}
const paths = (members: { path: string }[]) => members.map(({ path }) => path);

describe('membersOf', () => {
  it("yields a zip's files by their paths, archives among them, not folders or links", async () => {
    const inner = await zipOf({ 'inner.c': 'int inner;\n' });
    const zip = await zipOf(
      {
        'lab/': '',
        'lab/main.c': 'int main;\n',
        'lab/inner.zip': inner,
        'README.md': '# Lab\n',
      },
      { 'lab/passwd.txt': '/etc/passwd' },
    );

    expect(await read('labs.zip', zip)).toEqual([
      { path: 'lab/main.c', size: 10, text: 'int main;\n' },
      { path: 'lab/inner.zip', size: inner.length, text: inner.toString() },
      { path: 'README.md', size: 6, text: '# Lab\n' },
    ]);
  });

  it('yields the names a zip gives, for the hub to make safe, and leaves out what it packs other than by deflate', async () => {
    // made with Python's zipfile, which writes any name: ../escape.c,
    // /etc/abs.c, lab/../../up.c, lab\win.c, lab/bzip2.c (bzip2), lab/fine.c
    const hostile = readFileSync(
      join(import.meta.dirname, 'fixtures', 'hostile.zip'),
    );

    expect(paths(await read('hostile.zip', hostile))).toEqual([
      '../escape.c',
      '/etc/abs.c',
      'lab/../../up.c',
      'lab/win.c',
      'lab/fine.c',
    ]);
  });

  it('leaves out a zip entry packed past the ratio', async () => {
    const zip = await zipOf({
      'zeros.txt': '0'.repeat(1024 * 1024),
      'notes.txt': 'notes\n',
    });

    expect(paths(await read('labs.zip', zip))).toEqual(['notes.txt']);
  });

  it('fails on a zip past its limit, or what is no zip', async () => {
    const zip = await zipOf({ 'notes.txt': 'notes\n' });

    await expect(
      read('labs.zip', zip, { ...LIMITS, zip: zip.length - 1 }),
    ).rejects.toThrow(`a zip past ${zip.length - 1} bytes isn't read`);
    await expect(read('labs.zip', Buffer.from('notes\n'))).rejects.toThrow();
  });

  it("yields a tar's files by their paths, not its links or folders", async () => {
    const data = await tarOf(
      { './lab/main.c': 'int main;\n', '../escape.c': 'int escaped;\n' },
      [
        { name: 'lab/', type: 'directory' },
        { name: 'lab/passwd.txt', type: 'symlink', linkname: '/etc/passwd' },
        { name: 'lab/copy.c', type: 'link', linkname: 'lab/main.c' },
      ],
    );

    expect(await read('labs.tar', data)).toEqual([
      { path: './lab/main.c', size: 10, text: 'int main;\n' },
      { path: '../escape.c', size: 13, text: 'int escaped;\n' },
    ]);
  });

  it('goes on past the members the hub lets go of partway, or reads none of', async () => {
    const data = gzipSync(
      await tarOf({
        'a.bin': 'a'.repeat(200_000),
        'b.bin': 'b'.repeat(200_000),
        'c.c': 'c',
      }),
    );
    const seen = [];

    for await (const { path, content } of membersOf(
      input('labs.tgz', data),
      LIMITS,
    ))
      if (path === 'a.bin') {
        await content[Symbol.asyncIterator]().next();
        content.destroy();
      } else if (path === 'b.bin') content.destroy();
      else seen.push((await buffer(content)).toString());

    expect(seen).toEqual(['c']);
  });

  it.each(['labs.tgz', 'labs.TAR.gz'])(
    'yields the files of a tar in a gzip: %s',
    async (name) => {
      const data = gzipSync(await tarOf({ 'main.c': 'int main;\n' }));

      expect(paths(await read(name, data))).toEqual(['main.c']);
    },
  );

  it('fails on a tar unpacking past its limit, a gzip bomb', async () => {
    const data = gzipSync(
      await tarOf({ 'main.c': 'a', 'b.c': 'x'.repeat(5000) }),
    );

    await expect(
      read('labs.tgz', data, { ...LIMITS, tar: 4096 }),
    ).rejects.toThrow('unpacks past 4096 bytes');
  });

  it('fails on a tar.gz cut short', async () => {
    const data = gzipSync(await tarOf({ 'main.c': 'int main;\n' }));

    await expect(
      read('labs.tgz', data.subarray(0, data.length / 2)),
    ).rejects.toThrow();
  });

  it("yields a gzip's one file, named as the gzip less its .gz", async () => {
    expect(await read('Notes.TXT.gz', gzipSync('notes\n'))).toEqual([
      { path: 'Notes.TXT', size: undefined, text: 'notes\n' },
    ]);
  });

  it.each(['labs.zip', 'labs.tgz'])(
    'stops reading %s at the signal',
    async (name) => {
      const controller = new AbortController();
      const stalled = new Readable({ read() {} });
      const members = membersOf(
        {
          ...input(name, Buffer.alloc(0), controller.signal),
          content: async () => stalled,
        },
        LIMITS,
      );

      const next = members.next();
      controller.abort(new Error('time is up'));

      await expect(next).rejects.toThrow(/aborted/);
      expect(stalled.destroyed).toBe(true);
    },
  );
});

describe('ArchivesUnpacker', () => {
  it('unpacks an archive within the limits', async () => {
    const zip = await zipOf({ 'lab/main.c': 'int main;\n' });
    const members = [];

    for await (const { path } of new ArchivesUnpacker().unpack(
      input('labs.zip', zip),
    ))
      members.push(path);

    expect(members).toEqual(['lab/main.c']);
  });
});
