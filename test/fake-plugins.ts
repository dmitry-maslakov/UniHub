import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { text } from 'node:stream/consumers';
import { Injectable, Module } from '@nestjs/common';
import {
  Aggregator,
  ContentProcessor,
  PollConnector,
  PushConnector,
  ITEM_INGESTED,
  ITEM_REMOVED,
  type ConnectorContext,
  type HandlesMessages,
  type Message,
  type PollsPortal,
  type ProcessesContent,
  type ProcessorInput,
  type PushesFromPortal,
} from '@app/plugin-sdk';

// Plugins the way a real one is written: only @app/plugin-sdk, no hub imports.

export const FAKE_PORTAL = 'fake-portal';

// polled by the hub; the schedule is far away, tests ask for a sync instead
@PollConnector({ portal: FAKE_PORTAL, schedule: '0 0 1 1 *' })
@Injectable()
export class FakePollConnector implements PollsPortal {
  polls = 0;
  delayMs = 0;
  ctx?: ConnectorContext;

  async poll(ctx: ConnectorContext) {
    this.polls++;
    this.ctx = ctx;
    if (this.delayMs) await sleep(this.delayMs);
    const { ingest } = ctx;
    await ingest.course({ externalId: 'c1', name: 'Some course' });
    await ingest.item({
      externalId: 'i1',
      course: 'c1',
      kind: 'post',
      title: 'Notes are up',
      raw: {},
    });
    await ingest.file({ externalId: 'f1', course: 'c1', name: 'notes.txt' });
    await ingest.content('f1', Readable.from(['page one\fpage two']));
  }
}

@PushConnector({ portal: 'fake-push' })
@Injectable()
export class FakePushConnector implements PushesFromPortal {
  started: string[] = [];
  stopped = 0;

  start(ctx: ConnectorContext) {
    this.started.push(ctx.account);
  }

  stop() {
    this.stopped++;
  }
}

@ContentProcessor({ name: 'fake-text', version: 1, accepts: ['.TXT'] })
@Injectable()
export class FakeTextProcessor implements ProcessesContent {
  seen: string[] = [];

  async process(input: ProcessorInput) {
    const content = await text(await input.content());
    this.seen.push(content);
    return { parts: content.split('\f') };
  }
}

@ContentProcessor({
  name: 'fake-pdf',
  version: 1,
  accepts: ['application/pdf', '.pdf'],
})
@Injectable()
export class FakePdfProcessor implements ProcessesContent {
  seen: string[] = [];

  async process(input: ProcessorInput) {
    this.seen.push(input.name);
    return { parts: [] };
  }
}

@Aggregator({ name: 'fake-feed', topics: [ITEM_INGESTED, ITEM_REMOVED] })
@Injectable()
export class FakeAggregator implements HandlesMessages {
  received: Message[] = [];

  async handle(message: Message) {
    this.received.push(message);
  }
}

// fails the first time it sees each message
@Aggregator({ name: 'flaky-feed', topics: [ITEM_INGESTED] })
@Injectable()
export class FlakyAggregator implements HandlesMessages {
  failed = new Set<string>();
  received: Message[] = [];

  async handle(message: Message) {
    const key = JSON.stringify(message);
    if (!this.failed.has(key)) {
      this.failed.add(key);
      throw new Error('flaky');
    }
    this.received.push(message);
  }
}

@Module({
  providers: [
    FakePollConnector,
    FakePushConnector,
    FakeTextProcessor,
    FakePdfProcessor,
    FakeAggregator,
    FlakyAggregator,
  ],
})
export class FakePluginsModule {}
