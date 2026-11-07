import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PortalPicks } from '../application/portal-picks.js';

// Every hour, the courses wanted as their picks are now (PortalPicks):
// the scheduler's, so it runs where the background work does.
@Injectable()
export class ReconcileWantedSchedule {
  private readonly logger = new Logger(ReconcileWantedSchedule.name);

  constructor(private readonly picks: PortalPicks) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'reconcile-wanted' })
  async reconcile() {
    await this.picks.reconcile().catch((err: unknown) => {
      this.logger.error(
        'wanted courses reconcile failed',
        (err as Error).stack,
      );
    });
  }
}
