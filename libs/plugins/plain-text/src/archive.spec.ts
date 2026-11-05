import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import tar, { type Header } from 'tar-stream';
import yazl from 'yazl';
import {
  partsOf,
  Selection,
  textFiles,
  type Limits,
  type TextFile,
} from './archive.js';
import {
  MAX_BYTES,
  MAX_NOTEBOOK_BYTES,
  type ArchiveFormat,
} from './formats.js';

const LIMITS: Limits = {
  entries: 100,
  total: 2 * MAX_NOTEBOOK_BYTES,
  unpacked: 1024 * 1024,
  ratio: 100,
};

// these files deflated, a name ending in / as a folder
async function zipOf(files: Record<string, string | Buffer>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    if (name.endsWith('/')) zip.addEmptyDirectory(name);
    else zip.addBuffer(Buffer.from(content), name);
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

async function read(
  data: Buffer,
  format: ArchiveFormat,
  name = 'labs',
  limits = LIMITS,
) {
  const files = [];
  for await (const { path, kind, bytes } of textFiles(
    data,
    format,
    name,
    limits,
  ))
    files.push({ path, kind, text: bytes.toString() });
  return files;
}
const paths = (files: { path: string }[]) => files.map(({ path }) => path);

describe('Selection', () => {
  const take = (name: string, size = 10, packed?: number) =>
    new Selection(LIMITS).take(name, size, packed);

  it('takes what plain-text does, by the extension of its path', () => {
    expect(take('lab/Main.C')).toEqual({ path: 'lab/Main.C', kind: 'lines' });
    expect(take('./README.md')).toEqual({
      path: 'README.md',
      kind: 'markdown',
    });
    expect(take('lab//plots.ipynb')).toEqual({
      path: 'lab/plots.ipynb',
      kind: 'notebook',
    });
  });

  it.each([
    ['a folder', 'lab.c/'],
    ['a name with no extension', 'Makefile'],
    ['an archive in it', 'lab/inner.zip'],
    ['a gzip in it', 'notes.txt.gz'],
    ['a path out of it', 'lab/../../escape.c'],
    ['an absolute path', '/etc/passwd.txt'],
    ['a drive', 'C:/boot.ini'],
    ['minified code', 'static/jquery.min.js'],
    ["an editor's folder", '.idea/workspace.xml'],
    ['a hidden file', 'lab/.eslintrc.json'],
    ["npm's packages", 'node_modules/left-pad/index.js'],
    ["a Mac's resource fork", '__MACOSX/lab/._main.c'],
    ['build output', 'Lab1/obj/Debug/Lab1.csproj.FileListAbsolute.txt'],
  ])('leaves out %s: %s', (_, name) => {
    expect(take(name)).toBeNull();
  });

  it("leaves out a file past its kind's limit", () => {
    expect(take('data.csv', MAX_BYTES + 1)).toBeNull();
    expect(take('plots.ipynb', MAX_BYTES + 1)).not.toBeNull();
    expect(take('plots.ipynb', MAX_NOTEBOOK_BYTES + 1)).toBeNull();
  });

  it('leaves out an entry packed past the ratio, a zip bomb', () => {
    expect(take('zeros.txt', 1001, 10)).toBeNull();
    expect(take('notes.txt', 1000, 10)).not.toBeNull();
  });

  it('takes files up to the total, one past it left out and the next looked at', () => {
    const selection = new Selection({ ...LIMITS, total: 10 });
    const sizes = { 'a.c': 6, 'b.c': 6, 'c.c': 4 };

    expect(
      Object.entries(sizes).map(
        ([name, size]) => selection.take(name, size)?.path,
      ),
    ).toEqual(['a.c', undefined, 'c.c']);
  });

  it('looks at as many entries as its limit', () => {
    const selection = new Selection({ ...LIMITS, entries: 2 });
    expect([selection.more(), selection.more(), selection.more()]).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe('textFiles', () => {
  it('reads the text files of a zip by their path, not the archives in it', async () => {
    const zip = await zipOf({
      'lab/': '',
      'lab/main.c': 'int main() {}\n',
      'lab/inner.zip': await zipOf({ 'inner.c': 'int inner;\n' }),
      'README.md': '# Lab\n',
    });

    expect(await read(zip, 'zip')).toEqual([
      { path: 'lab/main.c', kind: 'lines', text: 'int main() {}\n' },
      { path: 'README.md', kind: 'markdown', text: '# Lab\n' },
    ]);
  });

  it('leaves out the entries a zip names out of it or packs other than by deflate, and reads the rest', async () => {
    // made with Python's zipfile, which writes any name: ../escape.c,
    // /etc/abs.c, lab/../../up.c, lab\win.c, lab/bzip2.c (bzip2), lab/fine.c
    const hostile = readFileSync(
      join(import.meta.dirname, 'fixtures', 'hostile.zip'),
    );
    expect(paths(await read(hostile, 'zip'))).toEqual([
      'lab/win.c',
      'lab/fine.c',
    ]);
  });

  it('leaves out a zip entry packed past the ratio', async () => {
    const zip = await zipOf({
      'zeros.txt': '0'.repeat(1024 * 1024),
      'notes.txt': 'notes\n',
    });
    expect(paths(await read(zip, 'zip'))).toEqual(['notes.txt']);
  });

  it.each([
    ['zip', zipOf],
    ['tar', tarOf],
  ] as const)(
    'reads the first entries of a %s with more than are looked at',
    async (format, pack) => {
      const data = await pack({ 'a.c': 'a', 'b.c': 'b', 'c.c': 'c' });
      expect(
        paths(await read(data, format, 'labs', { ...LIMITS, entries: 2 })),
      ).toEqual(['a.c', 'b.c']);
    },
  );

  it("reads a tar's files, not its links or folders", async () => {
    const data = await tarOf(
      { './lab/main.c': 'int main;\n', '../escape.c': 'int escaped;\n' },
      [
        { name: 'lab/', type: 'directory' },
        { name: 'lab/passwd.txt', type: 'symlink', linkname: '/etc/passwd' },
        { name: 'lab/copy.c', type: 'link', linkname: 'lab/main.c' },
      ],
    );

    expect(await read(data, 'tar')).toEqual([
      { path: 'lab/main.c', kind: 'lines', text: 'int main;\n' },
    ]);
  });

  it.each([
    ['tgz', 'labs.tgz'],
    ['gzip', 'labs.TAR.gz'],
  ] as const)('reads a tar in a gzip: %s %s', async (format, name) => {
    const data = gzipSync(await tarOf({ 'main.c': 'int main;\n' }));
    expect(paths(await read(data, format, name))).toEqual(['main.c']);
  });

  it("reads a gzip's one file, named as the gzip less its .gz", async () => {
    expect(await read(gzipSync('notes\n'), 'gzip', 'Notes.TXT.gz')).toEqual([
      { path: 'Notes.TXT', kind: 'lines', text: 'notes\n' },
    ]);
  });

  it('reads nothing of a gzip unpacking past the limit, a gzip bomb', async () => {
    const bomb = gzipSync(Buffer.alloc(LIMITS.unpacked + 1));
    expect(await read(bomb, 'gzip', 'notes.txt.gz')).toEqual([]);
  });
});

describe('partsOf', () => {
  const file = (text: string): TextFile => ({
    path: 'lab/main.c',
    kind: 'lines',
    bytes: Buffer.from(text),
  });
  const head = 'lab/main.c\n\n';

  it("starts each part with the file's path, a long file going on under it", () => {
    const text = 'int x;\n'.repeat(10);
    const parts = partsOf(file(text), head.length + 30);

    expect(parts).toHaveLength(3);
    expect(parts.every((part) => part.startsWith(head))).toBe(true);
    expect(parts.every((part) => part.length <= head.length + 30)).toBe(true);
    expect(parts.map((part) => part.slice(head.length)).join('')).toBe(text);
  });

  it('makes no parts of binary content', () => {
    expect(partsOf(file('\u0000\u0001\u0002'), 100)).toEqual([]);
  });
});
