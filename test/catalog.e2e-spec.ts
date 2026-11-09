import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  TransactionHost,
  TransactionNotActiveError,
} from '@nestjs-cls/transactional';
import { NO_INSTANCE, PortalId } from '@app/kernel';
import {
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  ListFilesOfContentQuery,
  ListVisibleContentQuery,
  RemoveFileCommand,
  RemoveItemCommand,
  SetFileContentCommand,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  Slug,
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
const ref = (externalId: string) => ({
  portal,
  instance: NO_INSTANCE,
  externalId,
});

const item = (fields: Partial<ItemInput> = {}): ItemInput => ({
  portal,
  instance: NO_INSTANCE,
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
  instance: NO_INSTANCE,
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
      instance: NO_INSTANCE,
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

  it("keeps a record as the shared account's version of it, seen through its sight", async () => {
    const post = item({ externalId: 'post-seen' });
    const { id } = await commands.execute(new UpsertItemCommand(post));
    await commands.execute(new UpsertItemCommand({ ...post, title: 'Moved' }));
    const sights = () =>
      prisma.itemSight.findMany({ where: { version: { itemId: id } } });
    const [shown] = await sights();

    // one version, under the record's id, changed in place
    expect(
      await prisma.itemVersion.findMany({
        where: { item: ref('post-seen') },
        select: { id: true, itemId: true, title: true },
      }),
    ).toEqual([{ id, itemId: id, title: 'Moved' }]);
    expect(shown).toMatchObject({
      account: 'shared',
      versionId: id,
      open: true,
      openFrom: shown.shownFrom,
      hiddenFrom: null,
    });
    await commands.execute(new RemoveItemCommand(ref('post-seen')));
    const [hidden] = await sights();
    expect(hidden.hiddenFrom).toEqual(expect.any(Date));
    expect(hidden.shownFrom).toEqual(shown.shownFrom);
    await commands.execute(new UpsertItemCommand(post));
    expect(await sights()).toEqual([shown]);
  });

  it('refuses what an app from before versions writes, any column of a record but its site', async () => {
    const { id } = await commands.execute(
      new UpsertItemCommand(item({ externalId: 'post-old-app' })),
    );
    // a write conflict, as that app's queries take it
    const conflict = { code: 'P2034' };
    await expect(
      prisma.item.update({ where: { id }, data: { externalId: 'edited' } }),
    ).rejects.toMatchObject(conflict);
    await expect(
      prisma.portalCourse.updateMany({ where: { portal }, data: { portal } }),
    ).rejects.toMatchObject(conflict);
    // and lets a record's site be stamped, the one update this app makes
    const site = 'https://lms.example.edu';
    for (const instance of [site, NO_INSTANCE])
      await prisma.item.update({ where: { id }, data: { instance } });
    // a new record with its old columns, which this app's client can't name
    for (const insert of [
      prisma.$executeRaw`INSERT INTO "Item" (id, portal, "externalId", kind, raw, "updatedAt") VALUES ('old-app', ${portal}, 'old-app', 'post', '{}', now())`,
      prisma.$executeRaw`INSERT INTO "File" (id, portal, "externalId", name, "updatedAt") VALUES ('old-app', ${portal}, 'old-app', 'a.pdf', now())`,
    ])
      await expect(insert).rejects.toThrow(
        'catalog keeps records in versions now',
      );
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
    const row = await prisma.itemVersion.findUniqueOrThrow({
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
    const row = await prisma.itemVersion.findFirstOrThrow({
      where: { item: ref('post-null') },
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
        item({
          portal: PortalId.parse('committed'),
          instance: NO_INSTANCE,
          externalId: 'a',
        }),
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
      await prisma.fileVersion.findUniqueOrThrow({ where: { id } }),
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
        instance: NO_INSTANCE,
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
      prisma.fileVersion.findFirstOrThrow({ where: { file: ref('attached') } }),
      prisma.portalCourse.findUniqueOrThrow({
        where: { portal_instance_externalId: ref('course-a') },
      }),
      prisma.item.findUniqueOrThrow({
        where: { portal_instance_externalId: ref('post-a') },
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

  it('lists the content the given courses show, by folder and name', async () => {
    // a and b are the courses asked for, c another, d has none
    const courseIds: Record<string, string> = {};
    for (const name of ['vis-a', 'vis-b', 'vis-c', 'vis-d'])
      await commands.execute(
        new UpsertPortalCourseCommand({
          portal,
          instance: NO_INSTANCE,
          externalId: name,
          name,
          url: null,
          meta: null,
        }),
      );
    for (const name of ['vis-a', 'vis-b', 'vis-c']) {
      ({ id: courseIds[name] } = await commands.execute(
        new CreateCourseCommand(Slug.parse(name), CourseName.parse(name)),
      ));
      await commands.execute(
        new LinkPortalCourseCommand(Slug.parse(name), ref(name), null),
      );
    }
    for (const externalId of ['vis-post', 'vis-gone'])
      await commands.execute(
        new UpsertItemCommand(item({ externalId, course: 'vis-a' })),
      );
    const files: [string, Partial<FileInput>, string | null][] = [
      ['b.pdf', { course: 'vis-a', path: 'lectures' }, '%PDF slides'],
      ['z.pdf', { course: 'vis-a' }, '%PDF notes'],
      ['a.pdf', { item: 'vis-post' }, '%PDF slides'],
      ['answers.pdf', { item: 'vis-gone' }, '%PDF answers'],
      ['removed.pdf', { course: 'vis-a' }, '%PDF removed'],
      ['empty.pdf', { course: 'vis-a' }, null],
      ['copy.pdf', { course: 'vis-b', path: 'x' }, '%PDF slides'],
      ['other.pdf', { course: 'vis-c' }, '%PDF other'],
      ['unlinked.pdf', { course: 'vis-d' }, '%PDF unlinked'],
    ];
    const ids: Record<string, string> = {};
    for (const [name, fields, content] of files) {
      const externalId = `vis-${name}`;
      ({ id: ids[name] } = await commands.execute(
        new UpsertFileCommand(file({ ...fields, externalId, name })),
      ));
      if (content)
        await commands.execute(
          new SetFileContentCommand(ref(externalId), sha256(content)),
        );
    }
    await commands.execute(new RemoveFileCommand(ref('vis-removed.pdf')));
    await commands.execute(new RemoveItemCommand(ref('vis-gone')));

    const [a, b] = [courseIds['vis-a'], courseIds['vis-b']];
    // as the shared account shows them to a reader granted a and b
    const reading = (courses: string[]) => ({
      accounts: [],
      shared: { courses, except: [] },
      picks: { portals: [], courses: [] },
    });
    const listed = await app
      .get(QueryBus)
      .execute(new ListVisibleContentQuery(reading([a, b]), null));
    expect(listed.map((f) => [f.name, f.courseId])).toEqual([
      ['a.pdf', a],
      ['z.pdf', a],
      ['b.pdf', a],
      ['copy.pdf', b],
    ]);
    const { id: portalCourseId } = await prisma.portalCourse.findFirstOrThrow({
      where: { portal, externalId: 'vis-a' },
    });
    expect(listed[0]).toEqual({
      fileId: ids['a.pdf'],
      courseId: a,
      portalCourseId,
      hash: sha256('%PDF slides'),
      name: 'a.pdf',
      path: '',
    });
    expect(
      await app
        .get(QueryBus)
        .execute(new ListVisibleContentQuery(reading([]), null)),
    ).toEqual([]);
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
      await prisma.fileVersion.findFirstOrThrow({
        where: { file: ref('racing') },
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
