import type { OnModuleDestroy } from '@nestjs/common';
import { InjectQueue, Processor } from '@nestjs/bullmq';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '../../../platform/database/prisma.service.js';
import { IndexText } from '../../application/index-text.js';
import { TextIndexUnavailableError } from '../../application/ports.js';
import { OUTAGE_PAUSE_MS, PausingWorker } from '../pausing.worker.js';
import { SEARCH_INDEX_QUEUE, type IndexJob } from './search-index.queue.js';

// a pause in a row past this many (10 min) is logged as an error, and then
// once every as many again
const PAUSES_BEFORE_ERROR = 20;

// One job at a time: the one node also answers searches, and a reconcile of
// the whole corpus mustn't flood it. A job that fails while the index or the
// database is away waits that out.
@Processor(SEARCH_INDEX_QUEUE, {
  concurrency: 1,
  lockDuration: 5 * 60_000,
  limiter: { max: 1_000, duration: 1_000 },
})
export class SearchIndexWorker
  extends PausingWorker<IndexJob>
  implements OnModuleDestroy
{
  private pauses = 0;

  constructor(
    private readonly indexText: IndexText,
    health: PrismaHealthIndicator,
    prisma: PrismaService,
    @InjectQueue(SEARCH_INDEX_QUEUE) queue: Queue<IndexJob>,
  ) {
    super(health, prisma, queue);
  }

  async process({ data }: Job<IndexJob>) {
    try {
      await this.indexText.run(data.key);
      this.pauses = 0;
    } catch (err) {
      const away =
        err instanceof TextIndexUnavailableError || (await this.databaseAway());
      if (!away) throw err;
      const said = `the search index or the database is away (${(err as Error).message}), indexing waits ${OUTAGE_PAUSE_MS / 1000} s`;
      if (++this.pauses % PAUSES_BEFORE_ERROR === 0) this.logger.error(said);
      else this.logger.warn(said);
      return this.pause();
    }
  }

  // Closed before any module shuts down, not where Nest closes workers, which
  // may come after the OpenSearch client: the client's close waits for the
  // requests in flight, so a worker still taking jobs would hold it up.
  async onModuleDestroy() {
    await this.worker.close();
  }

  protected nameOf() {
    return 'search index';
  }
}
