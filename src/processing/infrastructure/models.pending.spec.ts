import { exitCodeFor, pendingJobs } from './models.pending.js';

const queueOf = (counts: Record<string, number>) => ({
  getJobCounts: vi.fn(async () => counts),
});

describe('pendingJobs', () => {
  it('counts the jobs that wait, run or are delayed', async () => {
    const queue = queueOf({
      waiting: 2,
      active: 1,
      prioritized: 1,
      delayed: 3,
    });
    expect(await pendingJobs(queue as never)).toBe(7);
    expect(queue.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'active',
      'prioritized',
      'delayed',
    );
  });

  it('finds none in a queue with nothing in it', async () => {
    expect(
      await pendingJobs(
        queueOf({ waiting: 0, active: 0, prioritized: 0, delayed: 0 }) as never,
      ),
    ).toBe(0);
  });
});

describe('exitCodeFor', () => {
  it('is 0 with work and 3 without, leaving 1 and the rest for a failure', () => {
    expect(exitCodeFor(5)).toBe(0);
    expect(exitCodeFor(0)).toBe(3);
  });
});
