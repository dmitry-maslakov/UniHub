import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import type { PortalIngest } from '@app/plugin-sdk';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { bootApp } from './app.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// What an in-process plugin sends, through to postgres and back. Which
// records are refused is checked on fakes (IngestService, SdkPortalIngest).

const portal = 'ingest-test';

describe('ingest', () => {
  let app: INestApplication;
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
        publishedAt: new Date('2026-10-29T14:12:00Z'),
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
    app = await bootApp();
    hub = portalIngest(app, portal);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('stores what a plugin sends, and reads the same back on its next run', async () => {
    expect((await sync('%PDF slides v1')).every((r) => r.changed)).toBe(true);
    expect((await sync('%PDF slides v1')).map((r) => r.changed)).toEqual([
      false,
      false,
      false,
      false,
    ]);

    const [, , , content] = await sync('%PDF slides v2');
    expect(content).toEqual({ hash: sha256('%PDF slides v2'), changed: true });
    const file = await prisma.file.findFirstOrThrow({ where: { portal } });
    expect(file.contentHash).toBe(sha256('%PDF slides v2'));
  });

  it('removes an item and brings it back when it is sent again', async () => {
    const post = {
      externalId: 'post-1',
      course: 'ar',
      kind: 'post',
      title: 'Lecture 5 is up',
      raw: { guid: 'post-1' },
    };
    expect(await hub.removeItem('post-1')).toEqual({ changed: true });
    expect(await hub.removeItem('post-1')).toEqual({ changed: false });
    expect(await hub.item(post)).toEqual({ changed: true });
    const row = await prisma.item.findFirstOrThrow({
      where: { portal, externalId: 'post-1' },
    });
    expect(row.removedAt).toBeNull();
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
    expect(row.title).toBe('half an emoji �');
    expect(row.raw).toEqual({ score: 0, 'cut � here': [0] });
  });

  it('keeps the plugin state between runs, per account', async () => {
    expect(await hub.state()).toBeNull();
    await hub.saveState({ cursor: 5 });
    expect(await hub.state()).toEqual({ cursor: 5 });
    const other = portalIngest(app, portal, 'someone');
    expect(await other.state()).toBeNull();
    // a bare null is a state too, as if none was saved
    await hub.saveState(null);
    expect(await hub.state()).toBeNull();
  });
});
