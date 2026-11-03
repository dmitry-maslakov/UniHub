import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import { setTimeout as sleep } from 'node:timers/promises';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FILE_CONTENT_STORED, ITEM_INGESTED } from '@app/plugin-sdk';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { IngestCourseCommand } from '../src/ingest/application/commands/ingest-course.command.js';
import { IngestItemCommand } from '../src/ingest/application/commands/ingest-item.command.js';
import { IngestFileCommand } from '../src/ingest/application/commands/ingest-file.command.js';
import { IngestFileContentCommand } from '../src/ingest/application/commands/ingest-file-content.command.js';
import { SaveSyncStateCommand } from '../src/ingest/application/commands/save-sync-state.command.js';
import { GetSyncStateQuery } from '../src/ingest/application/queries/get-sync-state.query.js';
import { FILES_QUEUE, ITEMS_QUEUE } from '../src/processing/queues.js';

const portal = 'fake';

describe('ingest', () => {
  let commands: CommandBus;
  let queries: QueryBus;
  let prisma: PrismaService;
  let files: Queue;
  let items: Queue;
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
    files = app.get(getQueueToken(FILES_QUEUE));
    items = app.get(getQueueToken(ITEMS_QUEUE));
    await files.obliterate({ force: true });
    await items.obliterate({ force: true });
    close = () => app.close();

    await prisma.file.deleteMany({ where: { portal } });
    await prisma.item.deleteMany({ where: { portal } });
    await prisma.portalCourse.deleteMany({ where: { portal } });
    await prisma.syncState.deleteMany({ where: { portal } });
  });

  // jobs reach the queues through the outbox relay, so not right away
  async function jobs() {
    await sleep(1500);
    const [f, i] = await Promise.all([files.getJobs(), items.getJobs()]);
    return [...i, ...f].map((job) => [job.name, job.data]);
  }

  afterAll(() => close());

  it('stores what a plugin sends and announces it', async () => {
    await sync('slides v1');

    const item = await prisma.item.findFirstOrThrow({ where: { portal } });
    const file = await prisma.file.findFirstOrThrow({ where: { portal } });
    expect(file.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await jobs()).toEqual([
      [ITEM_INGESTED, { portal, itemId: item.id }],
      [
        FILE_CONTENT_STORED,
        { portal, fileId: file.id, hash: file.contentHash },
      ],
    ]);
  });

  it('stays quiet when the plugin resends the same data', async () => {
    await sync('slides v1');
    expect(await jobs()).toHaveLength(2);
  });

  it('notices new content of the same file', async () => {
    await sync('slides v2');
    const all = await jobs();
    expect(all).toHaveLength(3);
    expect(all.filter(([name]) => name === FILE_CONTENT_STORED)).toHaveLength(
      2,
    );
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
