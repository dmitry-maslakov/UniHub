import { exitCodeFor, pendingJobs, SOON_MS } from './models.pending.js';

const NOW = 1_000_000_000;

const queue = { toKey: (name: string) => `bull:models:${name}` };

// the queue as one transaction reads it: the lists' lengths by key, and the
// delayed set's first with its score, as BullMQ scores it
const redisOf = (
  lengths: Partial<Record<'wait' | 'active' | 'prioritized', number>> = {},
  due?: number,
) => {
  const reads: unknown[] = [];
  const chain = {
    llen: (key: string) => {
      reads.push(lengths[key.split(':').pop() as 'wait' | 'active'] ?? 0);
      return chain;
    },
    zcard: (key: string) => {
      reads.push(lengths[key.split(':').pop() as 'prioritized'] ?? 0);
      return chain;
    },
    zrange: () => {
      reads.push(due === undefined ? [] : ['job', String(due * 0x1000 + 7)]);
      return chain;
    },
    exec: async () => reads.map((read) => [null, read]),
  };
  return { multi: () => chain } as never;
};

describe('pendingJobs', () => {
  it('counts the jobs that wait or run', async () => {
    expect(
      await pendingJobs(
        queue,
        redisOf({ wait: 2, active: 1, prioritized: 1 }),
        NOW,
      ),
    ).toBe(4);
  });

  it('counts a retry due within a minute as work, a later one not', async () => {
    expect(await pendingJobs(queue, redisOf({}, NOW + SOON_MS - 1), NOW)).toBe(
      1,
    );
    expect(await pendingJobs(queue, redisOf({}, NOW + SOON_MS), NOW)).toBe(0);
  });

  it('finds none in a queue with nothing in it', async () => {
    expect(await pendingJobs(queue, redisOf(), NOW)).toBe(0);
  });
});

describe('exitCodeFor', () => {
  it('is 0 with work and 3 without, leaving 1 and the rest for a failure', () => {
    expect(exitCodeFor(5)).toBe(0);
    expect(exitCodeFor(0)).toBe(3);
  });
});
