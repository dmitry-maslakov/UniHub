import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  TransactionHost,
  TransactionNotActiveError,
} from '@nestjs-cls/transactional';
import { PortalId } from '@app/kernel';
import {
  ListFilesOfContentQuery,
  RemoveFileCommand,
  SetFileContentCommand,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  type FileInput,
  type ItemInput,
} from '../src/catalog/contracts.js';
import { PortalFileRepository } from '../src/catalog/domain/portal-file/portal-file.repository.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { bootApp } from './app.js';
import { published } from './outbox.js';
import { sha256 } from './sha256.js';

// What catalog's rules are tested on fakes for (application/*.spec.ts) can
// still go wrong in postgres: how records are written and read back, what
// the queries find, the locks and the outbox.

const portal = PortalId.parse('catalog-test');
const ref = (externalId: string) => ({ portal, externalId });

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

describe('catalog', { timeout: 20_000 }, () => {
  let app: INestApplication;
  let commands: CommandBus;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await bootApp();
    commands = app.get(CommandBus);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('reads a portal course back as it was written', async () => {
    const course = {
      portal,
      externalId: 'os',
      name: 'OS',
      url: null,
      meta: { semester: 5 },
    };

    const first = await commands.execute(new UpsertPortalCourseCommand(course));
    const again = await commands.execute(new UpsertPortalCourseCommand(course));
    const renamed = await commands.execute(
      new UpsertPortalCourseCommand({ ...course, name: 'OS (advanced)' }),
    );

    expect(first.changed).toBe(true);
    expect(again).toEqual({ id: first.id, changed: false });
    expect(renamed).toEqual({ id: first.id, changed: true });
  });

  it('reads json back as the same item, whatever order jsonb keeps its keys in', async () => {
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
    const committed = published(
      app,
      ({ payload }) => (payload as { portal: string }).portal === 'committed',
    );

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
    // its message was never written, so the relay has nothing to publish
    // (the relay only polls: nothing woke it up for this one)
    expect(
      await prisma.$queryRaw`SELECT 1 FROM nest_outbox.messages WHERE payload->>'portal' = 'rolled-back'`,
    ).toEqual([]);
    await commands.execute(
      new UpsertItemCommand(
        item({ portal: PortalId.parse('committed'), externalId: 'a' }),
      ),
    );

    await committed;
    expect(
      await prisma.item.findFirst({ where: { portal: 'rolled-back' } }),
    ).toBeNull();
  });

  it("reads a file's content back, stale until new content comes", async () => {
    const f = file({ externalId: 'stale' });
    const { id } = await commands.execute(new UpsertFileCommand(f));
    await commands.execute(
      new SetFileContentCommand(ref('stale'), sha256('%PDF v1')),
    );

    const changed = { ...f, size: 4_000_000 };
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ changed: true, needsContent: true });
    // the download failed, the next sync sends the same metadata
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ changed: false, needsContent: true });

    await commands.execute(
      new SetFileContentCommand(ref('stale'), sha256('%PDF v2')),
    );
    expect(
      await commands.execute(new UpsertFileCommand(changed)),
    ).toMatchObject({ changed: false, needsContent: false });
    expect(
      await prisma.file.findUniqueOrThrow({ where: { id } }),
    ).toMatchObject({
      size: 4_000_000n,
      contentHash: sha256('%PDF v2'),
      contentStale: false,
    });
  });

  it('stores sizes over 2 GB', async () => {
    const big = file({ externalId: 'recording', size: 3_000_000_000 });
    await commands.execute(new UpsertFileCommand(big));
    const again = await commands.execute(new UpsertFileCommand(big));
    expect(again.changed).toBe(false);
  });

  it("puts a post's file in the post's course", async () => {
    await commands.execute(
      new UpsertPortalCourseCommand({
        portal,
        externalId: 'course-a',
        name: 'A',
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
  });

  it('finds the files that hold some content, not the removed ones', async () => {
    const hash = sha256('%PDF a handout in two posts');
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

  it('stores content after a sync of the file, not over it', async () => {
    const racing = file({ externalId: 'racing', size: 1 });
    await commands.execute(new UpsertFileCommand(racing));
    await commands.execute(
      new SetFileContentCommand(ref('racing'), sha256('%PDF v1')),
    );

    // a sync of a new version holds the file until it commits...
    const held = Promise.withResolvers<void>();
    const wrote = Promise.withResolvers<void>();
    const sync = app.get(TransactionHost).withTransaction(async () => {
      await commands.execute(new UpsertFileCommand({ ...racing, size: 2 }));
      wrote.resolve();
      await held.promise;
    });
    await wrote.promise;
    // ...so its content waits for it, and then reads what it wrote
    const stored = commands.execute(
      new SetFileContentCommand(ref('racing'), sha256('%PDF v2')),
    );
    // (file locks are advisory locks of kind 3)
    await vi.waitFor(async () =>
      expect(
        await prisma.$queryRaw`SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 3 AND NOT granted`,
      ).toHaveLength(1),
    );
    held.resolve();
    await sync;

    expect(await stored).toEqual({ changed: true });
    expect(
      await prisma.file.findUniqueOrThrow({
        where: { portal_externalId: ref('racing') },
      }),
    ).toMatchObject({
      size: 2n,
      contentHash: sha256('%PDF v2'),
      contentStale: false,
    });
  });

  it('locks a record for an update only in a transaction', () => {
    // thrown before the method runs, so before any query
    expect(() =>
      app.get(PortalFileRepository).getForUpdate(ref('file-1')),
    ).toThrow(TransactionNotActiveError);
  });
});
