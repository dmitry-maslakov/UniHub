import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { Injectable, Module } from '@nestjs/common';
import {
  Aggregator,
  Connector,
  ContentProcessor,
  ITEM_INGESTED,
  ITEM_REMOVED,
  type ConnectorContext,
  type HandlesMessages,
  type Message,
  type PortalIngest,
  type ProcessesContent,
  type ProcessorInput,
  type RunsConnector,
} from '@app/plugin-sdk';

// Plugins the way a real one is written: only @app/plugin-sdk, no hub imports.

export const FAKE_PORTAL = 'fake-portal';

@Connector({ portal: FAKE_PORTAL })
@Injectable()
export class FakeConnector implements RunsConnector {
  private hub!: PortalIngest;

  start({ ingest }: ConnectorContext) {
    this.hub = ingest;
  }

  // a real connector would run this on a schedule
  async sync() {
    await this.hub.course({ externalId: 'c1', name: 'Some course' });
    await this.hub.item({
      externalId: 'i1',
      course: 'c1',
      kind: 'post',
      title: 'Notes are up',
      raw: {},
    });
    await this.hub.file({ externalId: 'f1', course: 'c1', name: 'notes.txt' });
    await this.hub.content('f1', Readable.from(['page one\fpage two']));
  }

  remove(externalId: string) {
    return this.hub.remove('item', externalId);
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
    FakeConnector,
    FakeTextProcessor,
    FakePdfProcessor,
    FakeAggregator,
    FlakyAggregator,
  ],
})
export class FakePluginsModule {}
