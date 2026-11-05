import { Logger } from '@nestjs/common';
import { TextIndexUnavailableError } from '../../application/ports.js';
import type { ReconcileIndex } from '../../application/reconcile-index.js';
import { OUTAGE_PAUSE_MS } from '../pausing.worker.js';
import { ReconcileIndexSchedule } from './reconcile-index.schedule.js';

// a schedule whose runs answer with these, in turn
function schedule(...answers: (number | Error)[]) {
  const run = vi.fn(async () => {
    const answer = answers.shift() ?? 0;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return {
    run,
    schedule: new ReconcileIndexSchedule({ run } as unknown as ReconcileIndex),
  };
}

describe('ReconcileIndexSchedule', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tries again while the index is away at start, until it goes through', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { run, schedule: s } = schedule(
      new TextIndexUnavailableError('starting'),
      new TextIndexUnavailableError('starting'),
      3,
    );

    void s.atStart();
    await vi.advanceTimersByTimeAsync(OUTAGE_PAUSE_MS - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2 * OUTAGE_PAUSE_MS);
    expect(run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10 * OUTAGE_PAUSE_MS);

    expect(run).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('logs any other failure at start, and tries no more', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { run, schedule: s } = schedule(new Error('another mapping'));

    void s.atStart();
    await vi.advanceTimersByTimeAsync(10 * OUTAGE_PAUSE_MS);

    expect(run).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'search index reconcile failed',
      expect.stringContaining('another mapping'),
    );
  });

  it('stops trying at shutdown', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { run, schedule: s } = schedule(
      new TextIndexUnavailableError('starting'),
    );

    void s.atStart();
    await vi.advanceTimersByTimeAsync(0);
    s.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(10 * OUTAGE_PAUSE_MS);

    expect(run).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs an hourly run that fails, whatever failed it', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { schedule: s } = schedule(new TextIndexUnavailableError('away'));

    await s.reconcile();

    expect(error).toHaveBeenCalledTimes(1);
  });
});
