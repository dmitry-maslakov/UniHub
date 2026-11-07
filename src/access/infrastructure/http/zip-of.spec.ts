import { PassThrough, Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import yauzl from 'yauzl';
import { zipOf } from './zip-of.js';

async function unzipped(data: Buffer) {
  const zip = await yauzl.fromBufferPromise(data);
  const entries = new Map<string, string>();
  for await (const entry of zip.eachEntry())
    entries.set(
      entry.fileName,
      (await buffer(await zip.openReadStreamPromise(entry))).toString(),
    );
  return entries;
}

describe('zipOf', () => {
  it('zips the entries in order, opening each when the one before is done', async () => {
    const opened: string[] = [];
    const entry = (name: string, content: string) => ({
      name,
      open: async () => {
        opened.push(name);
        return Readable.from([content]);
      },
    });

    const data = await buffer(
      zipOf([entry('a.txt', 'aa'), entry('d/b.txt', 'b')]),
    );

    expect(await unzipped(data)).toEqual(
      new Map([
        ['a.txt', 'aa'],
        ['d/b.txt', 'b'],
      ]),
    );
    expect(opened).toEqual(['a.txt', 'd/b.txt']);
  });

  it("destroys the output with the error of an entry that can't be opened", async () => {
    const output = zipOf([
      { name: 'a.txt', open: () => Promise.reject(new Error('gone')) },
    ]);

    await expect(buffer(output)).rejects.toThrowError('gone');
  });

  it('destroys the output with the error of an entry that fails midway', async () => {
    const failing = new Readable({ read() {} });
    failing.push('some');
    const output = zipOf([{ name: 'a.txt', open: async () => failing }]);
    const done = buffer(output);

    setImmediate(() => failing.destroy(new Error('EIO')));

    await expect(done).rejects.toThrowError('EIO');
  });

  it('closes the entry it has open when the client leaves', async () => {
    const open = new PassThrough();
    open.write('some');
    const output = zipOf([{ name: 'a.txt', open: async () => open }]);
    output.resume();
    await vi.waitFor(() => expect(open.readableFlowing).not.toBeNull());

    output.destroy();

    await vi.waitFor(() => expect(open.destroyed).toBe(true));
  });
});
