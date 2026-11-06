import { Logger } from '@nestjs/common';
import { testMeter } from '../../../test/metrics.js';
import { observeQueues, STATES } from './queue-metrics.js';

// a queue as BullMQ reads it from Redis: its counts, and its rate limit's
// time left (0 when it has none)
const queue = (name: string, counts: number[], rateLimitTtl = 0) => ({
  name,
  getJobCounts: vi.fn(async (...states: string[]) =>
    Object.fromEntries(states.map((state, i) => [state, counts[i]])),
  ),
  getRateLimitTtl: vi.fn(async () => rateLimitTtl),
});

const plugins = {
  'unihub.queue.jobs{queue=plugins,state=waiting}': 3,
  'unihub.queue.jobs{queue=plugins,state=active}': 1,
  'unihub.queue.jobs{queue=plugins,state=delayed}': 2,
  'unihub.queue.jobs{queue=plugins,state=failed}': 0,
  'unihub.queue.rate_limited{queue=plugins}': 0,
};

describe('observeQueues', () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads each queue's jobs by state, and whether it waits out an outage, when a scrape asks", async () => {
    const { meter, read } = testMeter();
    const queues = [
      queue('plugins', [3, 1, 2, 0]),
      queue('search-index', [40, 0, 0, 1], 25_000),
    ];
    observeQueues(meter, queues, { status: 'ready' });
    expect(queues[0].getJobCounts).not.toHaveBeenCalled();

    expect(await read()).toEqual({
      ...plugins,
      'unihub.queue.jobs{queue=search-index,state=waiting}': 40,
      'unihub.queue.jobs{queue=search-index,state=active}': 0,
      'unihub.queue.jobs{queue=search-index,state=delayed}': 0,
      'unihub.queue.jobs{queue=search-index,state=failed}': 1,
      'unihub.queue.rate_limited{queue=search-index}': 1,
      'unihub.queue.counts_read': 1,
    });
    expect(queues[0].getJobCounts).toHaveBeenCalledWith(...STATES);
  });

  // the exporter keeps serving what it last read
  it('asks nothing while redis is away, saying the counts hold their last reading', async () => {
    const { meter, read } = testMeter();
    const counted = queue('plugins', [3, 1, 2, 0]);
    const redis = { status: 'ready' as const };
    observeQueues(meter, [counted], redis);

    expect(await read()).toEqual({ ...plugins, 'unihub.queue.counts_read': 1 });
    Object.assign(redis, { status: 'reconnecting' });
    expect(await read()).toEqual({ ...plugins, 'unihub.queue.counts_read': 0 });
    expect(counted.getJobCounts).toHaveBeenCalledTimes(1);
    expect(counted.getRateLimitTtl).toHaveBeenCalledTimes(1);
  });

  it("lets the scrape go on when redis doesn't answer in time, or fails, saying so in a warning", async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { meter, read } = testMeter();
    const stuck = queue('plugins', [3, 1, 2, 0]);
    stuck.getJobCounts
      .mockReturnValueOnce(new Promise(() => {}))
      .mockRejectedValueOnce(new Error('READONLY'));
    observeQueues(meter, [stuck], { status: 'ready' }, 20);

    for (let i = 0; i < 2; i++)
      expect(await read()).toEqual({ 'unihub.queue.counts_read': 0 });
    expect(warn.mock.calls).toEqual([
      ["queue counts not read: redis didn't answer within 20 ms"],
      ['queue counts not read: READONLY'],
    ]);
  });
});
