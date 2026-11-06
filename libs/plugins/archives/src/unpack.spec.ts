import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import tar, { type Header } from 'tar-stream';
import yazl from 'yazl';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import { ArchivesExpander } from './archives.expander.js';
import { LIMITS, type Limits } from './entries.js';
import { entriesOf } from './unpack.js';

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
const input = (name: string, data: Buffer): ProcessorInput => ({
  name,
  mime: null,
  matched: extname(name).toLowerCase(),
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () => Readable.from([data]),
});

// the entries with what they hold, as the hub stores them
async function read(name: string, data: Buffer, limits: Limits = LIMITS) {
  const entries = [];
  for await (const entry of entriesOf(input(name, data), limits)) {
    const text = (await buffer(await entry.content())).toString();
    entries.push({ path: entry.path, size: entry.size, text });
  }
  return entries;
}
const paths = (entries: { path: string }[]) => entries.map(({ path }) => path);

describe('entriesOf', () => {
  it('yields the files of a zip by their path, archives in it among them', async () => {
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

  it('leaves out the entries a zip names out of it or packs other than by deflate, and yields the rest', async () => {
    // made with Python's zipfile, which writes any name: ../escape.c,
    // /etc/abs.c, lab/../../up.c, lab\win.c, lab/bzip2.c (bzip2), lab/fine.c
    const hostile = readFileSync(
      join(import.meta.dirname, 'fixtures', 'hostile.zip'),
    );
    expect(paths(await read('hostile.zip', hostile))).toEqual([
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

  it('yields nothing of a zip past its limit', async () => {
    const zip = await zipOf({ 'notes.txt': 'notes\n' });
    expect(
      await read('labs.zip', zip, { ...LIMITS, zip: zip.length - 1 }),
    ).toEqual([]);
  });

  it.each([
    ['zip', zipOf],
    ['tar', tarOf],
  ] as const)(
    'yields the first entries of a %s with more than are looked at',
    async (format, pack) => {
      const data = await pack({ 'a.c': 'a', 'b.c': 'b', 'c.c': 'c' });
      expect(
        paths(await read(`labs.${format}`, data, { ...LIMITS, entries: 2 })),
      ).toEqual(['a.c', 'b.c']);
    },
  );

  it("yields a tar's files, not its links or folders", async () => {
    const data = await tarOf(
      { './lab/main.c': 'int main;\n', '../escape.c': 'int escaped;\n' },
      [
        { name: 'lab/', type: 'directory' },
        { name: 'lab/passwd.txt', type: 'symlink', linkname: '/etc/passwd' },
        { name: 'lab/copy.c', type: 'link', linkname: 'lab/main.c' },
      ],
    );

    expect(await read('labs.tar', data)).toEqual([
      { path: 'lab/main.c', size: 10, text: 'int main;\n' },
    ]);
  });

  it('goes on past the entries that are not read', async () => {
    const data = gzipSync(
      await tarOf({ 'a.bin': 'x'.repeat(5000), 'b.c': 'b' }),
    );
    const seen = [];
    for await (const entry of entriesOf(input('labs.tgz', data), LIMITS))
      if (entry.path === 'b.c')
        seen.push((await buffer(await entry.content())).toString());
    expect(seen).toEqual(['b']);
  });

  it.each(['labs.tgz', 'labs.TAR.gz'])(
    'yields the files of a tar in a gzip: %s',
    async (name) => {
      const data = gzipSync(await tarOf({ 'main.c': 'int main;\n' }));
      expect(paths(await read(name, data))).toEqual(['main.c']);
    },
  );

  it('fails on a tar unpacking past the limit, a gzip bomb', async () => {
    const data = gzipSync(
      await tarOf({ 'main.c': 'a', 'b.c': 'x'.repeat(5000) }),
    );
    await expect(
      read('labs.tgz', data, { ...LIMITS, unpacked: 4096 }),
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
});

describe('ArchivesExpander', () => {
  it('expands an archive within the limits', async () => {
    const zip = await zipOf({ 'lab/main.c': 'int main;\n' });
    const entries = [];
    for await (const { path } of new ArchivesExpander().expand(
      input('labs.zip', zip),
    ))
      entries.push(path);
    expect(entries).toEqual(['lab/main.c']);
  });
});
