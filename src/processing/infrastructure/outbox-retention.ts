import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxDeadLetters, OutboxEvents, OutboxInbox } from '@nestjs/outbox';
import type { Subscription } from 'rxjs';

const DAY = 24 * 60 * 60 * 1000;

// the outbox leaves cleaning up to the app; dead letters are also logged when
// they happen, nothing else would notice them
@Injectable()
export class OutboxRetention implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRetention.name);
  private subscription?: Subscription;

  constructor(
    private readonly inbox: OutboxInbox,
    private readonly deadLetters: OutboxDeadLetters,
    private readonly events: OutboxEvents,
  ) {}

  onModuleInit() {
    this.subscription = this.events.events$.subscribe((event) => {
      if (event.type === 'dead-lettered')
        this.logger.error(
          `gave up on ${event.message.topic} ${event.message.id}`,
          event.error instanceof Error
            ? event.error.stack
            : String(event.error),
        );
    });
  }

  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune() {
    await this.deadLetters.purge({ failedBefore: Date.now() - 14 * DAY });
    await this.inbox.prune('30d');
  }
}
