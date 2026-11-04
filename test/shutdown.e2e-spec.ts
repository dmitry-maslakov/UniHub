import { setTimeout as sleep } from 'node:timers/promises';
import { aborted } from 'node:util';
import { Injectable, Module } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  Aggregator,
  PollConnector,
  PushConnector,
  ITEM_INGESTED,
  type ConnectorContext,
  type HandlesMessages,
  type Message,
  type PollsPortal,
  type PushesFromPortal,
} from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import { AppModule } from '../src/app.module.js';
import { Connection } from '../src/ingest/contracts.js';
import { SyncConnectionCommand } from '../src/plugins/contracts.js';
import type { PluginJob } from '../src/processing/application/plugin-job.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { testEnv } from './env.js';
import { portalIngest } from './ingest.js';

const portal = 'shutdown-test';

@Aggregator({ name: 'slow-feed', topics: [ITEM_INGESTED] })
@Injectable()
class SlowAggregator implements HandlesMessages<typeof ITEM_INGESTED> {
  started = false;

  async handle(message: Message<typeof ITEM_INGESTED>) {
    if (message.payload.portal === portal) this.started = true;
    await sleep(1_500);
  }
}

@PushConnector({ portal: 'shutdown-push' })
@Injectable()
class StoppableConnector implements PushesFromPortal {
  stopped = false;

  async run(ctx: ConnectorContext) {
    await aborted(ctx.signal, this);
    this.stopped = true;
  }
}

// a poll that would go on for as long as nobody stops it
@PollConnector({ portal: 'shutdown-poll', schedule: '0 0 1 1 *' })
@Injectable()
class EndlessPoll implements PollsPortal {
  polling = false;
  stopped = false;

  async poll(ctx: ConnectorContext) {
    this.polling = true;
    await aborted(ctx.signal, this);
    this.stopped = true;
  }
}

@Module({ providers: [SlowAggregator, StoppableConnector, EndlessPoll] })
class ShutdownPluginsModule {}

describe('shutdown', () => {
  it('lets a running job finish and stops connectors', async () => {
    const app = await Test.createTestingModule({
      imports: [AppModule, ShutdownPluginsModule],
    }).compile();
    await app.init();

    await app
      .get(CommandBus)
      .execute(
        new SyncConnectionCommand(
          Connection.shared(PortalId.parse('shutdown-poll')),
        ),
      );
    await portalIngest(app, portal).item({
      externalId: 'p',
      kind: 'post',
      raw: {},
    });
    const slow = app.get(SlowAggregator);
    const poll = app.get(EndlessPoll);
    await vi.waitFor(
      () => {
        expect(slow.started).toBe(true);
        expect(poll.polling).toBe(true);
      },
      { timeout: 10_000 },
    );
    const push = app.get(StoppableConnector);

    await app.close();

    expect(push.stopped).toBe(true);
    expect(poll.stopped).toBe(true);
    // the job's end was recorded in redis, not left active to run again
    const redis = new Redis(testEnv.REDIS_URL, { maxRetriesPerRequest: null });
    const queue = new Queue<PluginJob>(PLUGINS_QUEUE, { connection: redis });
    const jobs = (await queue.getJobs()).filter(
      ({ data }) =>
        data.kind === 'handle' &&
        data.aggregator === 'slow-feed' &&
        data.message.payload.portal === portal,
    );
    expect(await Promise.all(jobs.map((job) => job.getState()))).toEqual([
      'completed',
    ]);
    await queue.close();
    await redis.quit();
  }, 30_000);
});
