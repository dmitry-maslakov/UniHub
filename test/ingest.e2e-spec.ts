import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import { CommandBus, EventBus, QueryBus, type IEvent } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { IngestCourseCommand } from '../src/ingest/application/commands/ingest-course.command.js';
import { IngestItemCommand } from '../src/ingest/application/commands/ingest-item.command.js';
import { IngestFileCommand } from '../src/ingest/application/commands/ingest-file.command.js';
import { IngestFileContentCommand } from '../src/ingest/application/commands/ingest-file-content.command.js';
import { SaveSyncStateCommand } from '../src/ingest/application/commands/save-sync-state.command.js';
import { GetSyncStateQuery } from '../src/ingest/application/queries/get-sync-state.query.js';
import {
  FileContentStoredEvent,
  ItemIngestedEvent,
} from '../src/ingest/domain/events.js';

const portal = 'fake';

describe('ingest', () => {
  let commands: CommandBus;
  let queries: QueryBus;
  let prisma: PrismaService;
  let events: IEvent[];
  let close: () => Promise<void>;

  // what a plugin does on every run: sends everything it sees
  async function sync(slides: string) {
    await commands.execute(
      new IngestCourseCommand(portal, { externalId: 'ar', name: 'AR' }),
    );
    await commands.execute(
      new IngestItemCommand(portal, {
        externalId: 'post-1',
        course: 'ar',
        kind: 'post',
        title: 'Lecture 5 is up',
        raw: { guid: 'post-1' },
      }),
    );
    await commands.execute(
      new IngestFileCommand(portal, {
        externalId: 'file-1',
        course: 'ar',
        item: 'post-1',
        name: 'lecture-5.pdf',
      }),
    );
    await commands.execute(
      new IngestFileContentCommand(portal, 'file-1', Readable.from([slides])),
    );
  }

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await app.init();
    commands = app.get(CommandBus);
    queries = app.get(QueryBus);
    prisma = app.get(PrismaService);
    app.get(EventBus).subscribe((e) => events.push(e));
    close = () => app.close();

    await prisma.file.deleteMany({ where: { portal } });
    await prisma.item.deleteMany({ where: { portal } });
    await prisma.portalCourse.deleteMany({ where: { portal } });
    await prisma.syncState.deleteMany({ where: { portal } });
  });

  beforeEach(() => {
    events = [];
  });

  afterAll(() => close());

  it('stores what a plugin sends and announces it', async () => {
    await sync('slides v1');

    const file = await prisma.file.findFirstOrThrow({ where: { portal } });
    expect(file.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(events).toEqual([
      expect.any(ItemIngestedEvent),
      new FileContentStoredEvent(portal, file.id, file.contentHash!),
    ]);
  });

  it('stays quiet when the plugin resends the same data', async () => {
    await sync('slides v1');
    expect(events).toEqual([]);
  });

  it('notices new content of the same file', async () => {
    await sync('slides v2');
    expect(events).toEqual([expect.any(FileContentStoredEvent)]);
  });

  it('refuses an item of a course it was never told about', async () => {
    await expect(
      commands.execute(
        new IngestItemCommand(portal, {
          externalId: 'post-2',
          course: 'nope',
          kind: 'post',
          raw: {},
        }),
      ),
    ).rejects.toThrow('unknown reference nope');
  });

  it('keeps the plugin state between runs', async () => {
    expect(await queries.execute(new GetSyncStateQuery(portal))).toBeNull();
    await commands.execute(new SaveSyncStateCommand(portal, { cursor: 5 }));
    expect(await queries.execute(new GetSyncStateQuery(portal))).toEqual({
      cursor: 5,
    });
  });
});
