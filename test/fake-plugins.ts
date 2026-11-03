import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { Injectable, Module } from '@nestjs/common';
import {
  Aggregator,
  Connector,
  ContentProcessor,
  ITEM_INGESTED,
  Ingest,
  type HandlesMessages,
  type PortalIngest,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';

// Plugins the way a real one is written: only @app/plugin-sdk, no hub imports.

export const FAKE_PORTAL = 'fake-portal';

@Connector({ portal: FAKE_PORTAL })
@Injectable()
export class FakeConnector {
  private readonly hub: PortalIngest;

  constructor(ingest: Ingest) {
    this.hub = ingest.forPortal(FAKE_PORTAL);
  }

  // a real connector would run this from @Cron
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
    await this.hub.saveState({ done: true });
  }
}

@ContentProcessor({ name: 'fake-text', version: 1, accepts: ['.txt'] })
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
  calls = 0;

  async process() {
    this.calls++;
    return { parts: [] };
  }
}

@Aggregator({ name: 'fake-feed', topics: [ITEM_INGESTED] })
@Injectable()
export class FakeAggregator implements HandlesMessages {
  received: unknown[] = [];

  async handle(_topic: string, payload: unknown) {
    this.received.push(payload);
  }
}

@Module({
  providers: [
    FakeConnector,
    FakeTextProcessor,
    FakePdfProcessor,
    FakeAggregator,
  ],
})
export class FakePluginsModule {}
