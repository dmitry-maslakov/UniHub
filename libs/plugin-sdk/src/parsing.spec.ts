import { Readable } from 'node:stream';
import { Worker } from 'node:worker_threads';
import { firstMessage, readUpTo } from './parsing.js';

// a worker running this code (CommonJS), with a small heap
const worker = (code: string) =>
  new Worker(
    `const { parentPort } = require('node:worker_threads');\n${code}`,
    {
      eval: true,
      resourceLimits: { maxOldGenerationSizeMb: 16 },
    },
  );

describe('readUpTo', () => {
  it('reads the content whole', async () => {
    const content = Readable.from([Buffer.from('ab'), Buffer.from('cd')]);
    expect((await readUpTo(content, 4))?.toString()).toBe('abcd');
  });

  it('gives up past the limit, without reading the rest', async () => {
    const endless = function* () {
      for (;;) yield Buffer.alloc(10);
    };
    expect(await readUpTo(Readable.from(endless()), 25)).toBeNull();
  });
});

describe('firstMessage', () => {
  it("is what the worker posts, and the worker's ended", async () => {
    const posting = worker(
      'parentPort.postMessage([1, 2]); setInterval(() => {}, 1000);',
    );

    expect(await firstMessage(posting, 5_000)).toEqual([1, 2]);
    expect(posting.threadId).toBe(-1);
  });

  it('rejects with what the worker threw', async () => {
    await expect(
      firstMessage(worker('throw new Error("not parsed")'), 5_000),
    ).rejects.toThrow('not parsed');
  });

  it('rejects when the worker runs out of its heap', async () => {
    const greedy = worker(
      'const all = []; for (;;) all.push(new Array(1e5).fill(1));',
    );
    await expect(firstMessage(greedy, 10_000)).rejects.toMatchObject({
      code: 'ERR_WORKER_OUT_OF_MEMORY',
    });
  });

  it('rejects past the timeout, the worker ended', async () => {
    const stuck = worker('setInterval(() => {}, 1000);');

    await expect(firstMessage(stuck, 50)).rejects.toThrow();
    expect(stuck.threadId).toBe(-1);
  });
});
