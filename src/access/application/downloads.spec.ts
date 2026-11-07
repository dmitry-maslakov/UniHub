import { Readable } from 'node:stream';
import type { CourseReader } from './course-reader.js';
import { Downloads, MAX_BYTES, downloadRequestSchema } from './downloads.js';
import { DownloadTooLargeError, NotReadableError } from './errors.js';
import {
  DownloadRequests,
  type DownloadRequest,
} from '../domain/download-requests.js';

class FakeRequests extends DownloadRequests {
  readonly kept = new Map<string, DownloadRequest>();
  async put(request: DownloadRequest) {
    const id = `r${this.kept.size + 1}`;
    this.kept.set(id, request);
    return id;
  }
  async get(id: string) {
    return this.kept.get(id) ?? null;
  }
}

// ana reads a1 and a2 of the course `os`, and archive z, with the member
// src/main.c; b1 is of `net`; nope is nobody's
const catalog = (): Record<
  string,
  { name: string; path: string; size: number | null; course: string }
> => ({
  a1: { name: 'a.pdf', path: 'Labs', size: 10, course: 'os-id' },
  a2: { name: 'a.pdf', path: 'Labs', size: 20, course: 'os-id' },
  b1: { name: 'b.pdf', path: '', size: 5, course: 'net-id' },
  z: { name: 'lab1.zip', path: 'Labs', size: 100, course: 'os-id' },
  big: { name: 'big.iso', path: '', size: MAX_BYTES, course: 'os-id' },
  loose: { name: 'loose.txt', path: '', size: null, course: 'os-id' },
});

function downloads() {
  const files = catalog();
  const reads: string[] = [];
  const reader = {
    entry: async (_: string, fileId: string, member?: string) => {
      const file = files[fileId];
      if (!file || (member !== undefined && member !== 'src/main.c'))
        throw new NotReadableError(file ? 'member' : 'file');
      return member === undefined
        ? { ...file, archive: undefined }
        : { ...file, name: 'main.c', size: 9, archive: file.name };
    },
    courseNames: async () =>
      new Map([
        ['os-id', 'Operativni sistemi'],
        ['net-id', 'Mreže'],
      ]),
    content: async (_: string, fileId: string, member?: string) => {
      reads.push(`${fileId}${member ? `:${member}` : ''}`);
      return { stream: Readable.from(['bytes']) };
    },
  } as unknown as CourseReader;
  const requests = new FakeRequests();
  return {
    downloads: new Downloads(reader, requests),
    requests,
    reads,
    files,
  };
}

describe('Downloads', () => {
  it('keeps a request for files she reads, named for their course, and counts each once', async () => {
    const { downloads: d, requests } = downloads();

    expect(
      await d.request('ana', [
        { file: 'a1' },
        { file: 'z', member: 'src/main.c' },
        { file: 'a1' },
      ]),
    ).toEqual({
      id: 'r1',
      name: 'Operativni sistemi.zip',
      count: 2,
      size: 19,
    });
    expect(requests.kept.get('r1')).toEqual({
      userId: 'ana',
      items: [{ file: 'a1' }, { file: 'z', member: 'src/main.c' }],
    });
  });

  it('names a request of several courses for the hub, and one without sizes counts none', async () => {
    const { downloads: d } = downloads();

    expect(
      await d.request('ana', [{ file: 'a1' }, { file: 'b1' }]),
    ).toMatchObject({ name: 'UniHub.zip', size: 15 });
    expect(await d.request('ana', [{ file: 'loose' }])).toMatchObject({
      size: 0,
    });
  });

  it('refuses over a gibibyte in all, and keeps nothing', async () => {
    const { downloads: d, requests } = downloads();

    expect(await d.request('ana', [{ file: 'big' }])).toMatchObject({
      size: MAX_BYTES,
    });
    await expect(
      d.request('ana', [{ file: 'big' }, { file: 'b1' }]),
    ).rejects.toThrowError(new DownloadTooLargeError(MAX_BYTES));
    expect(requests.kept.size).toBe(1);
  });

  it("refuses the whole request when one item isn't hers, and keeps nothing", async () => {
    const { downloads: d, requests } = downloads();

    await expect(
      d.request('ana', [{ file: 'a1' }, { file: 'nope' }]),
    ).rejects.toThrowError(new NotReadableError('file'));
    await expect(
      d.request('ana', [{ file: 'z', member: 'src/gone.c' }]),
    ).rejects.toThrowError(new NotReadableError('member'));
    expect(requests.kept.size).toBe(0);
  });

  it('opens a request as its owner reads it, with a name for each entry and none read yet', async () => {
    const { downloads: d, reads } = downloads();
    await d.request('ana', [
      { file: 'a1' },
      { file: 'a2' },
      { file: 'z', member: 'src/main.c' },
    ]);

    const { name, entries } = await d.open('ana', 'r1');

    expect(name).toBe('Operativni sistemi.zip');
    expect(entries.map(({ name, size }) => ({ name, size }))).toEqual([
      { name: 'Labs/a.pdf', size: 10 },
      { name: 'Labs/a (2).pdf', size: 20 },
      { name: 'Labs/lab1/src/main.c', size: 9 },
    ]);
    expect(reads).toEqual([]);
    const stream = await entries[2]!.open();
    expect((await stream.toArray()).join('')).toBe('bytes');
    expect(reads).toEqual(['z:src/main.c']);
  });

  it("opens none of another user's, an unknown or an expired id", async () => {
    const { downloads: d, requests } = downloads();
    await d.request('ana', [{ file: 'a1' }]);

    for (const [user, id] of [
      ['bob', 'r1'],
      ['ana', 'r2'],
    ] as const)
      await expect(d.open(user, id)).rejects.toThrowError(
        new NotReadableError('download'),
      );
    // run out
    requests.kept.clear();
    await expect(d.open('ana', 'r1')).rejects.toThrowError(
      new NotReadableError('download'),
    );
  });

  it('checks them again as it opens them', async () => {
    const { downloads: d, files } = downloads();
    await d.request('ana', [{ file: 'a1' }]);
    delete files.a1;

    await expect(d.open('ana', 'r1')).rejects.toThrowError(
      new NotReadableError('file'),
    );
  });
});

describe('downloadRequestSchema', () => {
  const id = '6f0d9b3e-3c2a-4f6e-8a55-0c1f4e6a9b11';

  it('takes 1 to 500 items, a file by its id and a member by its path', () => {
    const items = (n: number) => Array(n).fill({ file: id });
    expect(downloadRequestSchema.safeParse({ items: items(500) }).success).toBe(
      true,
    );
    for (const bad of [
      { items: [] },
      { items: items(501) },
      { items: [{ file: 'x' }] },
      { items: [{ file: id, member: '' }] },
      { items: [{ file: id, member: 'a'.repeat(1025) }] },
    ])
      expect(downloadRequestSchema.safeParse(bad).success).toBe(false);
    expect(
      downloadRequestSchema.parse({ items: [{ file: id, member: 'lab/a.c' }] }),
    ).toEqual({ items: [{ file: id, member: 'lab/a.c' }] });
  });
});
