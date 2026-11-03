import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  FILE_CONTENT_STORED,
  ITEM_INGESTED,
  Ingest,
  type ItemRecord,
  type PortalIngest,
} from '@app/plugin-sdk';
import { AppModule } from '../src/app.module.js';
import { UnknownReferenceError } from '../src/catalog/contracts.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { FILES_QUEUE, ITEMS_QUEUE } from '../src/processing/queues.js';
import { testEnv } from './env.js';

const portal = 'ingest-test';

describe('ingest', () => {
  let app: TestingModule;
  let hub: PortalIngest;
  let prisma: PrismaService;

  // what a plugin does on every run: sends everything it sees
  async function sync(slides: string) {
    return [
      await hub.course({ externalId: 'ar', name: 'AR' }),
      await hub.item({
        externalId: 'post-1',
        course: 'ar',
        kind: 'post',
        title: 'Lecture 5 is up',
        raw: { guid: 'post-1' },
      }),
      await hub.file({
        externalId: 'file-1',
        course: 'ar',
        item: 'post-1',
        name: 'lecture-5.pdf',
      }),
      await hub.content('file-1', Readable.from([slides])),
    ];
  }

  async function jobs() {
    const queues = [ITEMS_QUEUE, FILES_QUEUE].map((name) =>
      app.get<Queue>(getQueueToken(name)),
    );
    const all = (await Promise.all(queues.map((q) => q.getJobs()))).flat();
    return all
      .filter((job) => job.data.portal === portal)
      .map((job) => [job.name, job.data]);
  }

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
    hub = app.get(Ingest).forPortal(portal);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('stores what a plugin sends and queues work for plugins', async () => {
    const results = await sync('slides v1');
    expect(results.every((r) => r.changed)).toBe(true);

    const item = await prisma.item.findFirstOrThrow({ where: { portal } });
    const file = await prisma.file.findFirstOrThrow({ where: { portal } });
    await vi.waitFor(
      async () =>
        expect(await jobs()).toEqual(
          expect.arrayContaining([
            [ITEM_INGESTED, { portal, itemId: item.id }],
            [
              FILE_CONTENT_STORED,
              { portal, fileId: file.id, hash: file.contentHash },
            ],
          ]),
        ),
      { timeout: 10_000 },
    );
  });

  it('reports nothing changed when the plugin resends the same data', async () => {
    const results = await sync('slides v1');
    expect(results.map((r) => r.changed)).toEqual([false, false, false, false]);
  });

  it('queues new content of the same file', async () => {
    const [, , , content] = await sync('slides v2');
    expect(content.changed).toBe(true);
    await vi.waitFor(
      async () =>
        expect(
          (await jobs()).filter(([name]) => name === FILE_CONTENT_STORED),
        ).toHaveLength(2),
      { timeout: 10_000 },
    );
  });

  it("drops fields a record isn't allowed to set", async () => {
    const record = {
      externalId: 'post-sneaky',
      kind: 'post',
      raw: {},
      portal: 'someone-else',
      id: 'chosen-id',
      extra: true,
    } as unknown as ItemRecord;

    await hub.item(record);

    const row = await prisma.item.findFirstOrThrow({
      where: { externalId: 'post-sneaky' },
    });
    expect(row.portal).toBe(portal);
    expect(row.id).not.toBe('chosen-id');
  });

  it('accepts dates sent as strings and keeps them stable', async () => {
    const record = {
      externalId: 'post-dated',
      kind: 'post',
      publishedAt: '2026-10-29T14:12:00Z',
      raw: {},
    } as unknown as ItemRecord;

    await hub.item(record);
    const again = await hub.item(record);

    expect(again.changed).toBe(false);
    const row = await prisma.item.findFirstOrThrow({
      where: { externalId: 'post-dated' },
    });
    expect(row.publishedAt).toEqual(new Date('2026-10-29T14:12:00Z'));
  });

  it("doesn't store content of a file it was never told about", async () => {
    const blobs = async () =>
      (await readdir(testEnv.STORAGE_PATH, { recursive: true })).length;
    const before = await blobs();

    await expect(
      hub.content('nope', Readable.from(['whatever'])),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
    expect(await blobs()).toBe(before);
  });

  it('keeps the plugin state between runs', async () => {
    expect(await hub.state()).toBeNull();
    await hub.saveState({ cursor: 5 });
    expect(await hub.state()).toEqual({ cursor: 5 });
  });
});
