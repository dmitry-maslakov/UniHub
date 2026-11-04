import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type ItemRecord,
  type PortalIngest,
} from '@app/plugin-sdk';
import { AppModule } from '../src/app.module.js';
import { HubIngest } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
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

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
    hub = app.get(HubIngest).forPortal(portal);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('stores what a plugin sends', async () => {
    const results = await sync('slides v1');
    expect(results.every((r) => r.changed)).toBe(true);

    const file = await prisma.file.findFirstOrThrow({ where: { portal } });
    expect(file.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports nothing changed when the plugin resends the same data', async () => {
    const results = await sync('slides v1');
    expect(results.map((r) => r.changed)).toEqual([false, false, false, false]);
  });

  it('notices new content of the same file', async () => {
    const [, , , content] = await sync('slides v2');
    expect(content.changed).toBe(true);
  });

  it('asks for content only when the file needs it', async () => {
    const file = {
      externalId: 'file-1',
      course: 'ar',
      item: 'post-1',
      name: 'lecture-5.pdf',
    };
    expect(await hub.file(file)).toEqual({
      changed: false,
      needsContent: false,
    });
    expect(await hub.file({ ...file, externalId: 'file-2' })).toEqual({
      changed: true,
      needsContent: true,
    });
  });

  it('removes an item and brings it back when it is sent again', async () => {
    const post = {
      externalId: 'post-1',
      course: 'ar',
      kind: 'post',
      title: 'Lecture 5 is up',
      raw: { guid: 'post-1' },
    };
    expect(await hub.remove('item', 'post-1')).toEqual({ changed: true });
    expect(await hub.remove('item', 'post-1')).toEqual({ changed: false });
    expect(await hub.item(post)).toEqual({ changed: true });
    const row = await prisma.item.findFirstOrThrow({
      where: { portal, externalId: 'post-1' },
    });
    expect(row.removedAt).toBeNull();
  });

  it('rejects a record that is missing required fields', async () => {
    await expect(
      hub.item({ externalId: 'post-x' } as unknown as ItemRecord),
    ).rejects.toBeInstanceOf(InvalidRecordError);
  });

  it("rejects a file of one course on another course's post", async () => {
    await hub.course({ externalId: 'os', name: 'OS' });
    // the sdk's error, so a connector can skip the record and go on
    await expect(
      hub.file({
        externalId: 'file-x',
        course: 'os',
        item: 'post-1',
        name: 'x.pdf',
      }),
    ).rejects.toBeInstanceOf(InvalidRecordError);
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

  it('refuses text postgres could not store', async () => {
    await expect(
      hub.item({ externalId: 'nul', kind: 'post', title: 'a\u0000b', raw: {} }),
    ).rejects.toBeInstanceOf(InvalidRecordError);
    await expect(
      hub.item({ externalId: 'nul', kind: 'post', raw: { body: 'a\u0000b' } }),
    ).rejects.toBeInstanceOf(InvalidRecordError);
  });

  it('takes -0 and lone surrogates as postgres keeps them', async () => {
    // it keeps 0 and U+FFFD: sent again, nothing changed
    const post = {
      externalId: 'post-odd',
      kind: 'post',
      title: 'half an emoji \ud83d',
      raw: { score: -0, 'cut \udc00 here': [-0] },
    };
    const file = {
      externalId: 'file-odd',
      name: 'half \ud83d.pdf',
      size: -0,
    };
    expect(await hub.item(post)).toEqual({ changed: true });
    expect(await hub.item(post)).toEqual({ changed: false });
    expect(await hub.file(file)).toMatchObject({ changed: true });
    expect(await hub.file(file)).toMatchObject({ changed: false });

    const row = await prisma.item.findFirstOrThrow({
      where: { portal, externalId: 'post-odd' },
    });
    expect(row.title).toBe('half an emoji \uFFFD');
    expect(row.raw).toEqual({ score: 0, 'cut \uFFFD here': [0] });
  });

  it('checks what remove() and saveState() are given', async () => {
    await expect(
      hub.remove('course' as 'item', 'post-1'),
    ).rejects.toBeInstanceOf(InvalidRecordError);
    await expect(
      hub.saveState({ when: new Date() } as never),
    ).rejects.toBeInstanceOf(InvalidRecordError);
  });

  it('keeps the plugin state between runs, per account', async () => {
    expect(await hub.state()).toBeNull();
    await hub.saveState({ cursor: 5 });
    expect(await hub.state()).toEqual({ cursor: 5 });
    const other = app.get(HubIngest).forPortal(portal, 'someone');
    expect(await other.state()).toBeNull();
  });
});
