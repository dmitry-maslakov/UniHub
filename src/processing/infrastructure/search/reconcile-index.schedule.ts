import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import pRetry from 'p-retry';
import { TextIndexUnavailableError } from '../../application/ports.js';
import { ReconcileIndex } from '../../application/reconcile-index.js';
import { OUTAGE_PAUSE_MS } from '../pausing.worker.js';

// a start retried for up to this many times OUTAGE_PAUSE_MS (10 min)
const START_ATTEMPTS = 20;

// On start, OpenSearch may still be starting (the first time search is on),
// so it's tried again while the index is away. Then every hour: cheap (a
// composite scan, about 1.7 s per 30k keys), and it brings back a lost index.
// Both are the scheduler's, so they run where the background work does.
@Injectable()
export class ReconcileIndexSchedule implements OnModuleDestroy {
  private readonly logger = new Logger(ReconcileIndexSchedule.name);
  private readonly stopped = new AbortController();

  constructor(private readonly reconciler: ReconcileIndex) {}

  onModuleDestroy() {
    this.stopped.abort();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async reconcile() {
    await this.run().catch((err: unknown) => this.failed(err));
  }

  // once the app is up, so startup doesn't wait for OpenSearch
  @Timeout(0)
  async atStart() {
    await pRetry(() => this.run(), {
      retries: START_ATTEMPTS - 1,
      factor: 1,
      minTimeout: OUTAGE_PAUSE_MS,
      signal: this.stopped.signal,
      unref: true,
      shouldRetry: ({ error }) => error instanceof TextIndexUnavailableError,
      onFailedAttempt: ({ error, retriesLeft }) => {
        if (error instanceof TextIndexUnavailableError && retriesLeft)
          this.logger.warn(
            `search index away, reconcile again in ${OUTAGE_PAUSE_MS / 1000} s`,
          );
      },
    }).catch((err: unknown) => {
      if (!this.stopped.signal.aborted) this.failed(err);
    });
  }

  private async run() {
    const queued = await this.reconciler.run();
    if (queued) this.logger.log(`queued ${queued} search index jobs`);
  }

  private failed(err: unknown) {
    this.logger.error('search index reconcile failed', (err as Error).stack);
  }
}
