import { setTimeout as sleep } from 'node:timers/promises';
import { Test, type TestingModule } from '@nestjs/testing';
import { CommandBus } from '@nestjs/cqrs';
import { OutboxEvents } from '@nestjs/outbox';
import { TransactionHost } from '@nestjs-cls/transactional';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  SetFileContentCommand,
  UnknownReferenceError,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
  type FileInput,
  type ItemInput,
} from '../src/catalog/contracts.js';

const portal = 'catalog-test';

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
  let app: TestingModule;
  let commands: CommandBus;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();
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
            item({ portal: 'rolled-back', externalId: 'a' }),
          ),
        );
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    await commands.execute(
      new UpsertItemCommand(item({ portal: 'committed', externalId: 'a' })),
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
      new SetFileContentCommand(created.id, 'abc'),
    );
    const setAgain = await commands.execute(
      new SetFileContentCommand(created.id, 'abc'),
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
    expect(row.contentHash).toBe('abc');
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
});
