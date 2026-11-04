import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Reconcile } from '../application/reconcile.js';

// on start (a deploy may bring a new processor version) and once a day;
// several instances doing it at once queue each job once (deduplicated)
@Injectable()
export class ReconcileSchedule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReconcileSchedule.name);

  constructor(private readonly reconciler: Reconcile) {}

  onApplicationBootstrap() {
    // not awaited, startup doesn't wait for a scan
    void this.reconcile();
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reconcile() {
    try {
      const queued = await this.reconciler.run();
      if (queued) this.logger.log(`queued ${queued} missing processing jobs`);
    } catch (err) {
      this.logger.error('reconcile failed', (err as Error).stack);
    }
  }
}
