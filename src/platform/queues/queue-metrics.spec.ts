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

describe('observeQueues', () => {
  it("reads each queue's jobs by state, and whether it waits out an outage, when a scrape asks", async () => {
    const { meter, read } = testMeter();
    const plugins = queue('plugins', [3, 1, 2, 0]);
    const index = queue('search-index', [40, 0, 0, 1], 25_000);
    observeQueues(meter, [plugins, index], { status: 'ready' });
    expect(plugins.getJobCounts).not.toHaveBeenCalled();

    expect(await read()).toEqual({
      'unihub.queue.jobs{queue=plugins,state=waiting}': 3,
      'unihub.queue.jobs{queue=plugins,state=active}': 1,
      'unihub.queue.jobs{queue=plugins,state=delayed}': 2,
      'unihub.queue.jobs{queue=plugins,state=failed}': 0,
      'unihub.queue.rate_limited{queue=plugins}': 0,
      'unihub.queue.jobs{queue=search-index,state=waiting}': 40,
      'unihub.queue.jobs{queue=search-index,state=active}': 0,
      'unihub.queue.jobs{queue=search-index,state=delayed}': 0,
      'unihub.queue.jobs{queue=search-index,state=failed}': 1,
      'unihub.queue.rate_limited{queue=search-index}': 1,
    });
    expect(plugins.getJobCounts).toHaveBeenCalledWith(...STATES);
  });

  it('asks nothing while redis is away, and leaves the counts out', async () => {
    const { meter, read } = testMeter();
    const plugins = queue('plugins', [3, 1, 2, 0]);
    observeQueues(meter, [plugins], { status: 'reconnecting' });

    expect(await read()).toEqual({});
    expect(plugins.getJobCounts).not.toHaveBeenCalled();
    expect(plugins.getRateLimitTtl).not.toHaveBeenCalled();
  });
});
