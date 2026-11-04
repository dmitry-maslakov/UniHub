import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { OutboxEvents } from '@nestjs/outbox';
import {
  TransactionHost,
  TransactionNotActiveError,
} from '@nestjs-cls/transactional';
import { ContentHash, PortalId } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import {
  FILE_CONTENT_CHANGED,
  ListFilesOfContentQuery,
  MisplacedFileError,
  RemoveFileCommand,
  SetFileContentCommand,
  UnknownReferenceError,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  type FileInput,
  type ItemInput,
} from '../src/catalog/contracts.js';
import { bootApp } from './app.js';
import { PortalFileRepository } from '../src/catalog/domain/portal-file/portal-file.repository.js';

const portal = PortalId.parse('catalog-test');
const ref = (externalId: string) => ({ portal, externalId });
const hashOf = (content: string) =>
  ContentHash.parse(createHash('sha256').update(content).digest('hex'));

const item = (fields: Partial<ItemInput> = {}): ItemInput => ({
  portal,
  externalId: 'post-1',
  course: null,
  kind: 'post',
  title: 'Exam',
  url: null,
  publishedAt: null,
  raw: { guid: 'post-1' },
  ...fields,
});

const file = (fields: Partial<FileInput> = {}): FileInput => ({
  portal,
  externalId: 'file-1',
  course: null,
  item: null,
  name: 'lecture-5.pdf',
  path: '',
  url: null,
  size: 3_124_756,
  mime: null,
  sourceUpdatedAt: null,
  ...fields,
});

describe('catalog', () => {
  let app: INestApplication;
  let commands: CommandBus;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await bootApp();
    commands = app.get(CommandBus);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('writes a portal course only when it changes', async () => {
    const course = {
      portal,
      externalId: 'ar',
      name: 'AR',
      url: null,
      meta: null,
    };

    const first = await commands.execute(new UpsertPortalCourseCommand(course));
    const again = await commands.execute(new UpsertPortalCourseCommand(course));
    const renamed = await commands.execute(
      new UpsertPortalCourseCommand({ ...course, name: 'AR SIIT' }),
    );

    expect(first.changed).toBe(true);
    expect(again).toEqual({ id: first.id, changed: false });
    expect(renamed).toEqual({ id: first.id, changed: true });
  });

  it('treats json with reordered keys as the same item', async () => {
    await commands.execute(
      new UpsertItemCommand(item({ raw: { guid: 'post-1', title: 'Exam' } })),
    );
    const again = await commands.execute(
      new UpsertItemCommand(item({ raw: { title: 'Exam', guid: 'post-1' } })),
    );

    expect(again.changed).toBe(false);
  });

  it('clears a field the portal stopped sending', async () => {
    const withUrl = item({ externalId: 'post-url', url: 'https://x' });
    await commands.execute(new UpsertItemCommand(withUrl));

    const cleared = await commands.execute(
      new UpsertItemCommand({ ...withUrl, url: null }),
    );
    const again = await commands.execute(
      new UpsertItemCommand({ ...withUrl, url: null }),
    );

    expect(cleared.changed).toBe(true);
    expect(again.changed).toBe(false);
    const row = await prisma.item.findUniqueOrThrow({
      where: { id: again.id },
    });
    expect(row.url).toBeNull();
  });

  it('serialises concurrent upserts of one item', async () => {
    const same = item({ externalId: 'post-concurrent' });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        commands.execute(new UpsertItemCommand(same)),
      ),
    );

    expect(results.filter((r) => r.changed)).toHaveLength(1);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
  });

  it('commits or rolls back an item together with its message', async () => {
    const published: unknown[] = [];
    const subscription = app
      .get(OutboxEvents)
      .events$.subscribe(
        (e) => e.type === 'published' && published.push(e.message.payload),
      );
    const inPortal = (p: string) =>
      published.filter((m) => (m as { portal: string }).portal === p);

    await expect(
      app.get(TransactionHost).withTransaction(async () => {
        await commands.execute(
          new UpsertItemCommand(
            item({ portal: PortalId.parse('rolled-back'), externalId: 'a' }),
          ),
        );
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    await commands.execute(
      new UpsertItemCommand(
        item({ portal: PortalId.parse('committed'), externalId: 'a' }),
      ),
    );

    await vi.waitFor(() => expect(inPortal('committed')).toHaveLength(1), {
      timeout: 10_000,
    });
    // the relay has had its chance by now
    await sleep(1_500);
    subscription.unsubscribe();
    expect(inPortal('rolled-back')).toEqual([]);
    expect(
      await prisma.item.findFirst({ where: { portal: 'rolled-back' } }),
    ).toBeNull();
  });

  it('says when a file needs its content', async () => {
    const created = await commands.execute(new UpsertFileCommand(file()));
    expect(created).toMatchObject({ changed: true, needsContent: true });

    const set = await commands.execute(
      new SetFileContentCommand(ref('file-1'), hashOf('abc')),
    );
    const setAgain = await commands.execute(
      new SetFileContentCommand(ref('file-1'), hashOf('abc')),
    );
    expect(set.changed).toBe(true);
    expect(setAgain.changed).toBe(false);

    expect(await commands.execute(new UpsertFileCommand(file()))).toMatchObject(
      { changed: false, needsContent: false },
    );
    // a rename doesn't mean new content, a new size does
    expect(
      await commands.execute(new UpsertFileCommand(file({ name: 'l5.pdf' }))),
    ).toMatchObject({ changed: true, needsContent: false });
    expect(
      await commands.execute(
        new UpsertFileCommand(file({ name: 'l5.pdf', size: 3_200_000 })),
      ),
    ).toMatchObject({ changed: true, needsContent: true });

    const row = await prisma.file.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.contentHash).toBe(hashOf('abc'));
  });

  it('keeps asking for content until new content arrives', async () => {
    const f = file({ externalId: 'stale' });
    await commands.execute(new UpsertFileCommand(f));
    await commands.execute(
      new SetFileContentCommand(ref('stale'), hashOf('v1')),
    );

    const changed = { ...f, size: 4_000_000 };
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ needsContent: true });
    // the download failed, the next sync sends the same metadata
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ changed: false, needsContent: true });

    await commands.execute(
      new SetFileContentCommand(ref('stale'), hashOf('v2')),
    );
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ needsContent: false });
  });

  it('announces a removed file when it comes back', async () => {
    const published: { topic: string; payload: unknown }[] = [];
    const subscription = app
      .get(OutboxEvents)
      .events$.subscribe(
        (e) => e.type === 'published' && published.push(e.message),
      );
    const f = file({ externalId: 'comes-back' });
    const { id } = await commands.execute(new UpsertFileCommand(f));
    await commands.execute(
      new SetFileContentCommand(ref('comes-back'), hashOf('same')),
    );
    await commands.execute(new RemoveFileCommand(ref('comes-back')));

    await commands.execute(new UpsertFileCommand(f));

    await vi.waitFor(
      () =>
        expect(
          published.filter(
            (m) =>
              m.topic === FILE_CONTENT_CHANGED &&
              (m.payload as { fileId: string }).fileId === id,
          ),
        ).toHaveLength(2),
      { timeout: 10_000 },
    );
    subscription.unsubscribe();
  });

  it('finds the files that hold some content, not the removed ones', async () => {
    const hash = hashOf('a handout in two posts');
    for (const externalId of ['handout-a', 'handout-b']) {
      await commands.execute(new UpsertFileCommand(file({ externalId })));
      await commands.execute(new SetFileContentCommand(ref(externalId), hash));
    }
    await commands.execute(new RemoveFileCommand(ref('handout-b')));

    const files = await app
      .get(QueryBus)
      .execute(new ListFilesOfContentQuery(hash));
    expect(files.map((f) => f.externalId)).toEqual(['handout-a']);
  });

  it('stores sizes over 2 GB', async () => {
    const big = file({ externalId: 'recording', size: 3_000_000_000 });
    await commands.execute(new UpsertFileCommand(big));
    const again = await commands.execute(new UpsertFileCommand(big));
    expect(again.changed).toBe(false);
  });

  it('refuses an item of a course it was never told about', async () => {
    await expect(
      commands.execute(new UpsertItemCommand(item({ course: 'nope' }))),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
  });

  it('takes a bare null in raw as what is stored', async () => {
    // postgres keeps a json null: sent again, nothing changed (-0 and lone
    // surrogates come in the form they are kept, see the ingest spec)
    const odd = item({ externalId: 'post-null', raw: null });
    expect(await commands.execute(new UpsertItemCommand(odd))).toMatchObject({
      changed: true,
    });
    expect(await commands.execute(new UpsertItemCommand(odd))).toMatchObject({
      changed: false,
    });
    const row = await prisma.item.findUniqueOrThrow({
      where: { portal_externalId: ref('post-null') },
    });
    expect(row.raw).toBeNull();
  });

  it('stores content after a sync of the file, not over it', async () => {
    const racing = file({ externalId: 'racing', size: 1 });
    await commands.execute(new UpsertFileCommand(racing));
    await commands.execute(
      new SetFileContentCommand(ref('racing'), hashOf('v1')),
    );

    // a sync of a new version holds the file until it commits...
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let synced!: () => void;
    const wrote = new Promise<void>((resolve) => (synced = resolve));
    const sync = app.get(TransactionHost).withTransaction(async () => {
      await commands.execute(new UpsertFileCommand({ ...racing, size: 2 }));
      synced();
      await held;
    });
    await wrote;
    // ...so its content waits for it, and then reads what it wrote
    const stored = commands.execute(
      new SetFileContentCommand(ref('racing'), hashOf('v2')),
    );
    // (file locks are advisory locks of kind 3)
    await vi.waitFor(async () =>
      expect(
        await prisma.$queryRaw`SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 3 AND NOT granted`,
      ).toHaveLength(1),
    );
    release();
    await sync;

    expect(await stored).toEqual({ changed: true });
    expect(
      await prisma.file.findUniqueOrThrow({
        where: { portal_externalId: ref('racing') },
      }),
    ).toMatchObject({
      size: 2n,
      contentHash: hashOf('v2'),
      contentStale: false,
    });
  });

  it('locks a record for an update only in a transaction', () => {
    // thrown before the method runs, so before any query
    expect(() =>
      app.get(PortalFileRepository).getForUpdate(ref('file-1')),
    ).toThrow(TransactionNotActiveError);
  });

  it("puts a post's file in the post's course, and no other", async () => {
    for (const externalId of ['course-a', 'course-b'])
      await commands.execute(
        new UpsertPortalCourseCommand({
          portal,
          externalId,
          name: externalId,
          url: null,
          meta: null,
        }),
      );
    await commands.execute(
      new UpsertItemCommand(item({ externalId: 'post-a', course: 'course-a' })),
    );

    const attached = file({ externalId: 'attached', item: 'post-a' });
    await commands.execute(new UpsertFileCommand(attached));
    // naming the post's own course as well is the same file
    expect(
      await commands.execute(
        new UpsertFileCommand({ ...attached, course: 'course-a' }),
      ),
    ).toMatchObject({ changed: false });
    const [row, course, post] = await Promise.all([
      prisma.file.findUniqueOrThrow({
        where: { portal_externalId: ref('attached') },
      }),
      prisma.portalCourse.findUniqueOrThrow({
        where: { portal_externalId: ref('course-a') },
      }),
      prisma.item.findUniqueOrThrow({
        where: { portal_externalId: ref('post-a') },
      }),
    ]);
    expect(row).toMatchObject({ portalCourseId: course.id, itemId: post.id });

    await expect(
      commands.execute(
        new UpsertFileCommand({ ...attached, course: 'course-b' }),
      ),
    ).rejects.toBeInstanceOf(MisplacedFileError);
  });
});
