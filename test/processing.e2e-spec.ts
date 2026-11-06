import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import { FILE_CONTENT_CHANGED } from '../src/catalog/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import {
  jobId,
  type PluginJob,
  type ProcessJob,
} from '../src/processing/application/plugin-job.js';
import {
  FileFacts,
  PluginJobQueue,
} from '../src/processing/application/ports.js';
import { Reconcile } from '../src/processing/application/reconcile.js';
import { UnpackingRepository } from '../src/processing/domain/unpacking.js';
import { PLUGINS_QUEUE } from '../src/processing/infrastructure/plugins.queue.js';
import { bootApp } from './app.js';
import { FakePluginsModule, FakeTextProcessor } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { published } from './outbox.js';
import { sha256 } from './sha256.js';

// processing as BullMQ and postgres run it: jobs by the work's id, which
// files hold content, what's stored. What runs and what's skipped is
// checked on fakes (Dispatch, ProcessContent, Reconcile).

const portal = 'processing-test';
// fake-text's work on some content
const job = (content: string): ProcessJob => ({
  kind: 'process',
  key: {
    hash: sha256(content),
    processor: PluginName.parse('fake-text'),
    version: 1,
  },
});
const text = 'the same notes in two courses';
const notes = job(text);
const { hash } = notes.key;

describe('processing', { timeout: 20_000 }, () => {
  let app: INestApplication;
  let hub: PortalIngest;
  let prisma: PrismaService;

  const stored = () =>
    prisma.representation.findUnique({
      where: { hash_processor_version: notes.key },
    });

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
    hub = portalIngest(app, portal);
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('stores what a processor made of the content', async () => {
    await hub.file({ externalId: 'a', name: 'a.txt' });
    await hub.content('a', Readable.from([text]));

    await vi.waitFor(
      async () => expect((await stored())?.parts).toEqual([text]),
      { timeout: 10_000, interval: 200 },
    );
  });

  it('processes the same content in another file only once', async () => {
    const seen = () =>
      app.get(FakeTextProcessor).seen.filter((t) => t === text).length;
    const queue = app.get<Queue<PluginJob>>(getQueueToken(PLUGINS_QUEUE));
    // a's job, kept for a day once done: its id is the work's
    await vi.waitFor(async () =>
      expect(await queue.getJobState(jobId(notes))).toBe('completed'),
    );
    const announced = published(
      app,
      ({ topic, payload }) =>
        topic === FILE_CONTENT_CHANGED &&
        (payload as { hash: string }).hash === hash,
    );

    await hub.file({ externalId: 'b', name: 'b.txt' });
    await hub.content('b', Readable.from([text]));
    await announced;

    // b's processing is that job, so nothing more was queued
    expect(
      (
        await queue.getJobs(['wait', 'active', 'delayed', 'prioritized'])
      ).filter(({ data }) => data.kind === 'process' && data.key.hash === hash),
    ).toEqual([]);
    expect(seen()).toBe(1);
  });

  it('queues processing that went missing', async () => {
    await prisma.representation.delete({
      where: { hash_processor_version: notes.key },
    });

    expect(await app.get(Reconcile).run()).toBeGreaterThanOrEqual(1);
    await vi.waitFor(async () => expect(await stored()).not.toBeNull(), {
      timeout: 10_000,
      interval: 200,
    });
  });

  it('takes a removed file for gone, as catalog keeps it', async () => {
    await hub.file({ externalId: 'gone', name: 'gone.txt' });
    await hub.removeFile('gone');
    const { id } = await prisma.file.findUniqueOrThrow({
      where: { portal_externalId: { portal, externalId: 'gone' } },
    });

    expect(await app.get(FileFacts).file(id)).toBeNull();
  });

  it('unpacks a container into a tree, then processes its members by their names', async () => {
    // no file holds the member's text: fake-text takes it by its name
    const inside = 'a member\fof a bundle';
    const lab = JSON.stringify({ 'docs/inside.txt': inside, 'empty.bin': '' });
    await hub.file({ externalId: 'lab', name: 'lab.bundle' });
    await hub.content('lab', Readable.from([lab]));

    await vi.waitFor(
      async () =>
        expect(
          await prisma.representation.findUnique({
            where: { hash_processor_version: job(inside).key },
          }),
        ).toMatchObject({ parts: ['a member', 'of a bundle'] }),
      { timeout: 10_000, interval: 200 },
    );
    expect(await app.get(UnpackingRepository).current(sha256(lab))).toEqual({
      hash: sha256(lab),
      unpacker: 'fake-bundle',
      version: 1,
      policy: 1,
      members: [
        {
          path: 'docs/inside.txt',
          hash: sha256(inside),
          size: 20,
          mime: null,
          leftOut: null,
        },
        {
          path: 'empty.bin',
          hash: sha256(''),
          size: 0,
          mime: null,
          leftOut: null,
        },
      ],
      cutShort: null,
    });
  });

  it("replaces a content's tree whole", async () => {
    const unpackings = app.get(UnpackingRepository);
    const tree = {
      hash: sha256('a tree made again'),
      unpacker: PluginName.parse('fake-bundle'),
      version: 1,
      policy: 1,
      cutShort: null,
    };
    const member = (path: string, content: string) => ({
      path,
      hash: sha256(content),
      size: content.length,
      mime: null,
      leftOut: null,
    });
    await unpackings.save({
      ...tree,
      members: [member('a.c', 'a'), member('b.c', 'b')],
    });

    await unpackings.save({
      ...tree,
      version: 2,
      members: [
        member('b.c', 'b'),
        { ...member('big.c', ''), hash: null, leftOut: 'TOO_LARGE' as const },
      ],
      cutShort: 'the container: bad header',
    });

    expect(await unpackings.current(tree.hash)).toEqual({
      ...tree,
      version: 2,
      members: [
        member('b.c', 'b'),
        { ...member('big.c', ''), hash: null, leftOut: 'TOO_LARGE' },
      ],
      cutShort: 'the container: bad header',
    });
    expect(await unpackings.holding(sha256('a'))).toEqual([]);
    expect(await unpackings.holding(sha256('b'))).toEqual([
      { container: tree.hash, path: 'b.c', mime: null },
    ]);
  });

  it('queues the same processing once, whether a message or a reconcile asks first', async () => {
    const queue = app.get<Queue>(getQueueToken(PLUGINS_QUEUE));
    const jobs = app.get(PluginJobQueue);
    const sent = job('sent first');
    const reconciled = job('reconciled first');
    const queued = async ({ key }: ProcessJob) =>
      (await queue.getJobs('wait')).filter(
        ({ data }) => data.key?.hash === key.hash,
      ).length;

    // nothing runs before it's counted
    await queue.pause();
    try {
      await jobs.enqueue([sent]);
      await jobs.requeue(sent);
      await jobs.requeue(reconciled);
      await jobs.enqueue([reconciled]);

      expect([await queued(sent), await queued(reconciled)]).toEqual([1, 1]);
    } finally {
      await queue.resume();
    }
  });

  it('queues it again once the last reconcile job for it is done', async () => {
    // that job is kept in redis for a day; it mustn't block the next run.
    // Done means finished in redis too, not just its result saved: its
    // deduplication ends then (other spec files share the queue, so not
    // "no jobs left")
    const queue = app.get<Queue>(getQueueToken(PLUGINS_QUEUE));
    await vi.waitFor(
      async () =>
        expect(await queue.getDeduplicationJobId(jobId(notes))).toBeNull(),
      { timeout: 10_000, interval: 100 },
    );
    await prisma.representation.delete({
      where: { hash_processor_version: notes.key },
    });

    await app.get(Reconcile).run();
    await vi.waitFor(async () => expect(await stored()).not.toBeNull(), {
      timeout: 10_000,
      interval: 200,
    });
  });
});
