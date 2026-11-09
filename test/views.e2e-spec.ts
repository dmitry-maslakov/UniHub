import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { getQueueToken } from '@nestjs/bullmq';
import type { Client } from '@opensearch-project/opensearch';
import type { Queue } from 'bullmq';
import {
  PollConnector,
  type ConnectorContext,
  type CoursePass,
  type Credential,
  type FileRecord,
  type IdentifiesAccounts,
  type PollsPortal,
  type PortalIngest,
  type PortalUser,
} from '@app/plugin-sdk';
import { PluginName, PortalId } from '@app/kernel';
import {
  CourseName,
  CreateCourseCommand,
  Slug,
  type Shown,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import { SyncConnectionCommand } from '../src/plugins/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import {
  Connection,
  IngestService,
  SdkPortalIngest,
} from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
} from '../src/processing/application/ports.js';
import { keyId } from '../src/processing/domain/representation.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import {
  CONNECTORS_QUEUE,
  type ConnectorJob,
} from '../src/plugins/infrastructure/connectors.queue.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';

// A portal read with users' own accounts, as the whole app reads it: each
// user's account sends what it sees by passes, and each user reads what
// their own account sees and nothing of another's, by every route and by
// search, a section's post and a file locked for one of them included; an
// admin reads it through an account of their own alone, and a grant gives
// none of it. Linking an account puts it on its grid and polls it with its
// credential, what that first run finds shown as each pass ends and a
// later run's at its slot; unlinking forgets what it saw. Whose views a user
// reads, how catalog cuts a query by them, what a pass makes of a view and
// when it shows, are checked on fakes (viewers.spec.ts,
// course-reader.spec.ts, course-search.spec.ts, view.handlers.spec.ts,
// course-pass.spec.ts, publication.spec.ts, connection-directory.spec.ts).
// Past cy's runs, the passes here are sent as a run of each account would
// send them, shown from a time past (or opened from one to come) rather
// than at the slot a run would have.

const LMS = PortalId.parse('views-lms');
const CAMPUS = PortalId.parse('views-campus');
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const fakeText = PluginName.parse('fake-text');
const past = new Date('2026-01-01T00:00:00Z');
const future = new Date('2999-01-01T00:00:00Z');

// the runs the worker started, by whose token they had
const polled: {
  account: ConnectorContext['account']['kind'];
  token: string;
}[] = [];

// cy's runs, the only ones that send anything: her first, once the spec
// lets it go, lists c3 and sends a post of it; a later one lists c4 too,
// and sends a post of that
const cy = { runs: 0, ended: 0, letGo: () => {} };
const cysFirst = new Promise<void>((resolve) => (cy.letGo = resolve));
async function cysRun(ingest: PortalIngest) {
  if (cy.runs++ === 0) await cysFirst;
  const courses = cy.runs === 1 ? ['c3'] : ['c3', 'c4'];
  const course = courses.at(-1)!;
  await ingest.courses(
    courses.map((id) => ({ externalId: id, name: `Course ${id}` })),
  );
  const pass = await ingest.pass(course);
  await pass.item({
    externalId: `${course}-news`,
    kind: 'announcement',
    title: `${course}-news`,
    raw: { message: 'cy poruka' },
  });
  await pass.end();
  cy.ended++;
}

// whoever's token it is, by the name before ~
@PollConnector({ portal: LMS, schedule: '0 0 1 1 *', links: ['token'] })
@Injectable()
class LmsPortal implements PollsPortal, IdentifiesAccounts {
  async poll({ account, ingest }: ConnectorContext) {
    const token =
      account.kind === 'user'
        ? (await account.credential()).token.reveal()
        : '';
    polled.push({ account: account.kind, token });
    if (token.startsWith('cy~')) await cysRun(ingest);
  }

  async identify({ token }: Credential): Promise<PortalUser> {
    return { id: token.reveal().split('~')[0], expiresAt: null };
  }
}

@Module({ providers: [LmsPortal] })
class LmsModule {}

interface Listed {
  id: string;
  title?: string;
  name?: string;
  hasContent?: boolean;
}

describe('views of accounts of their own', { timeout: 60_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, userId, makeAdmin } = accounts(() => app, mails);
  let opensearch: Client;
  let prisma: PrismaService;
  const as: Record<string, string> = {};
  const account: Record<string, string> = {};
  // the versions the accounts saw, by the portal's id, or a post's title
  const version: Record<string, string> = {};
  // whether file() told each account's pass to fetch a file
  const fetch: Record<string, boolean> = {};

  const get = (who: string, path: string) =>
    http().get(path).set('cookie', as[who]);
  // the courses a user reads, of this spec, each with its portals in order
  const listed = async (who: string) =>
    (
      (await body(who, '/api/courses')) as {
        slug: string;
        portalCourses: { portal: string }[];
      }[]
    )
      .filter(({ slug }) => slug.startsWith('views-'))
      .map(({ slug, portalCourses }) => [
        slug,
        portalCourses.map((pc) => pc.portal).sort((a, b) => a.localeCompare(b)),
      ]);
  const sorted = (titles: (string | null | undefined)[]) =>
    titles.map(String).sort((a, b) => a.localeCompare(b));
  const body = async (who: string, path: string) =>
    (await get(who, path).expect(200)).body;
  const titles = async (who: string, slug: string) =>
    ((await body(who, `/api/courses/${slug}/items`)) as Listed[]).map(
      (i) => i.title,
    );
  const search = async (who: string, q: string) =>
    (
      (await get(who, `/api/search?q=${q}`).expect(200)).body.results as {
        fileId?: string;
        itemId?: string;
      }[]
    ).map((r) => r.fileId ?? r.itemId);
  // there once it's in the index in whole, and searchable
  const indexed = (id: string) =>
    vi.waitFor(
      async () =>
        expect(
          (await opensearch.exists({ index, id, realtime: false })).body,
        ).toBe(true),
      { timeout: 20_000, interval: 200 },
    );
  // a record's manifest gone from the index, as a get sees it: at once
  const unindexed = (id: string) =>
    vi.waitFor(
      async () =>
        expect((await opensearch.exists({ index, id })).body).toBe(false),
      { timeout: 20_000, interval: 200 },
    );

  // what a run of the account sends, shown as `at` says
  const ingestOf = (
    who: string,
    at: Shown = { shownFrom: past, openFrom: past },
  ): PortalIngest =>
    new SdkPortalIngest(
      app.get(IngestService),
      Connection.of({ portal: LMS, account: account[who] }),
      new AbortController().signal,
      { shown: () => at, leaseMs: 60 * 60_000 },
    );
  // ana's posts of c1 as her first passes send them
  const anasPosts = ['news', 'section', 'edited', 'gone', 'going'];
  const post = (externalId: string, title = externalId) => ({
    externalId,
    kind: 'announcement',
    title,
    raw: { message: `${title} poruka` },
  });
  const file = (
    pass: CoursePass,
    who: string,
    record: Omit<FileRecord, 'name'>,
    locked = false,
  ) =>
    pass
      .file(
        { ...record, name: `${record.externalId}.txt`, size: 16 },
        { locked },
      )
      .then(
        (answer) => (fetch[`${who} ${record.externalId}`] ??= answer.fetch),
      );
  const versionOf = async (
    table: 'itemVersion' | 'fileVersion',
    externalId: string,
    key = externalId,
  ) => {
    const where = { portal: LMS, externalId };
    const row =
      table === 'itemVersion'
        ? await prisma.itemVersion.findFirstOrThrow({
            where: { item: where, title: key },
          })
        : await prisma.fileVersion.findFirstOrThrow({ where: { file: where } });
    return (version[key] = row.id);
  };

  beforeAll(async () => {
    vi.stubEnv('PORTAL_LINKS', `${LMS}=token`);
    vi.stubEnv(
      'PORTAL_CREDENTIALS_SECRETS',
      `1:${randomBytes(32).toString('base64')}`,
    );
    app = await bootApp({ mails, imports: [FakePluginsModule, LmsModule] });
    prisma = app.get(PrismaService);
    opensearch = app.get(OPENSEARCH);
    const commands = app.get(CommandBus);

    // ana and bo link accounts of their own; ed is an admin with none; dee
    // is granted the course
    for (const who of ['ana', 'bo', 'ed', 'dee'])
      as[who] = await signUp(`${who}@views.test`);
    await makeAdmin('ed@views.test');
    for (const who of ['ana', 'bo']) {
      await http()
        .put(`/api/me/portals/${LMS}/token`)
        .set('cookie', as[who])
        .send({ token: `${who}~${randomBytes(8).toString('hex')}` })
        .expect(204);
      account[who] = (
        await prisma.portalAccount.findFirstOrThrow({
          where: { userId: await userId(`${who}@views.test`) },
        })
      ).id;
    }

    // a campus portal read as shared, record by record
    const campus: PortalIngest = portalIngest(app, CAMPUS);
    await campus.course({ externalId: 'campus-os', name: 'Campus OS' });
    await campus.item({ ...post('campus-news'), course: 'campus-os' });

    // ana's account sees c1 and c2, the section's post, slides; bo's c1
    // alone, slides locked, the edited post as it is now, another version
    // of it, and a post locked for him; a handout attached to the edited
    // post, for both
    const ana = ingestOf('ana');
    await ana.courses([
      { externalId: 'c1', name: 'Course c1' },
      { externalId: 'c2', name: 'Course c2' },
    ]);
    const anas = await ana.pass('c1');
    for (const id of anasPosts) await anas.item(post(id));
    await file(anas, 'ana', { externalId: 'slides' });
    await file(anas, 'ana', { externalId: 'handout', item: 'edited' });
    await anas.end();
    const anasC2 = await ana.pass('c2');
    await anasC2.item(post('c2-news'));
    await anasC2.end();

    const bo = ingestOf('bo');
    await bo.courses([{ externalId: 'c1', name: 'Course c1' }]);
    const bos = await bo.pass('c1');
    await bos.item(post('news'));
    await bos.item(post('edited', 'edited since'));
    await file(bos, 'bo', { externalId: 'slides' }, true);
    await file(bos, 'bo', { externalId: 'handout', item: 'edited' });
    await bos.item(post('sealed'), { locked: true });
    await bos.end();

    // the slides' bytes, fetched by the one run told to; then a later file
    // of ana's, its content to open at a time to come
    const { hash: slides } = await anas.content(
      'slides',
      Readable.from(['slajdovi semafor']),
    );
    const later = await ingestOf('ana', {
      shownFrom: past,
      openFrom: future,
    }).pass('c1');
    for (const id of anasPosts) await later.item(post(id));
    for (const id of ['slides', 'later'])
      await file(later, 'ana', { externalId: id });
    await file(later, 'ana', { externalId: 'handout', item: 'edited' });
    await later.end();
    // then passes that hide a post from a time past, and show one and hide
    // another from a time to come, the rest as it was
    await (await ingestOf('ana').pass('c1')).end({ items: ['gone'] });
    const toCome = await ingestOf('ana', {
      shownFrom: future,
      openFrom: future,
    }).pass('c1');
    await toCome.item(post('soon'));
    await toCome.end({ items: ['going'] });
    const { hash: kasnije } = await later.content(
      'later',
      Readable.from(['kasnije semafor']),
    );
    for (const hash of [slides, kasnije])
      await indexed(keyId({ hash, processor: fakeText, version: 1 }));

    // the course: lms's c1 and the campus's; c2 no course links
    const { id: course } = await commands.execute(
      new CreateCourseCommand(Slug.parse('views-os'), CourseName.parse('OS')),
    );
    for (const [portal, externalId] of [
      [LMS, 'c1'],
      [CAMPUS, 'campus-os'],
    ])
      await http()
        .put(`/api/portal-courses/${portal}/${externalId}/course`)
        .set('cookie', as.ed)
        .send({ course: 'views-os' })
        .expect(204);
    await commands.execute(
      new GrantCourseAccessCommand(await userId('dee@views.test'), course),
    );

    for (const id of [
      'news',
      'section',
      'edited',
      'c2-news',
      'soon',
      'gone',
      'going',
      'sealed',
    ])
      await versionOf('itemVersion', id);
    await versionOf('itemVersion', 'edited', 'edited since');
    for (const id of ['slides', 'later', 'handout'])
      await versionOf('fileVersion', id);
    // 'gone' no account sees any longer, so the index leaves it out
    for (const id of ['news', 'section', 'soon', 'going', 'sealed'])
      await indexed(`post__${version[id]}`);
  }, 60_000);

  afterAll(async () => {
    // a run of cy's still waiting goes on, so the app can stop
    cy.letGo();
    // the accounts and their credentials, which other specs count
    for (const who of ['ana', 'bo', 'ed', 'cy'].filter((who) => as[who]))
      await http()
        .delete(`/api/me/portals/${LMS}/token`)
        .set('cookie', as[who])
        .expect(204);
    // and what they saw out of the index, by this app, so no spec after it
    // starts behind its removals: a few seconds each
    for (const id of ['news', 'section', 'soon', 'going', 'c3-news', 'c4-news'])
      if (version[id]) await unindexed(`post__${version[id]}`);
    await app.close();
    vi.unstubAllEnvs();
  }, 30_000);

  it('runs each linked account on a grid of its own, with its own credential', async () => {
    const queue = app.get<Queue<ConnectorJob>>(getQueueToken(CONNECTORS_QUEUE));
    const schedulers = await queue.getJobSchedulers();
    for (const who of ['ana', 'bo'])
      expect(
        schedulers.find((s) => s.key === `${LMS}__${account[who]}`),
      ).toMatchObject({ every: 60 * 60_000 });
    // linking polled each at once
    await vi.waitFor(
      () =>
        expect(
          polled
            .map((p) => [p.account, p.token.split('~')[0]])
            .sort(([, a], [, b]) => a.localeCompare(b)),
        ).toEqual([
          ['user', 'ana'],
          ['user', 'bo'],
        ]),
      { timeout: 20_000, interval: 200 },
    );
  });

  it("shows what a newly linked account's first run finds as each pass ends, a later run's at its slot", async () => {
    as.cy = await signUp('cy@views.test');
    await http()
      .put(`/api/me/portals/${LMS}/token`)
      .set('cookie', as.cy)
      .send({ token: `cy~${randomBytes(8).toString('hex')}` })
      .expect(204);
    account.cy = (
      await prisma.portalAccount.findFirstOrThrow({
        where: { userId: await userId('cy@views.test') },
      })
    ).id;
    const firstSync = async () =>
      (
        (await body('cy', '/api/me/portals')) as {
          portal: string;
          firstSync: boolean;
        }[]
      ).find(({ portal }) => portal === LMS)?.firstSync;

    // linking ran her account at once: read for the first time, nothing shown
    await vi.waitFor(() => expect(cy.runs).toBe(1), {
      timeout: 20_000,
      interval: 100,
    });
    expect(await firstSync()).toBe(true);
    expect(await listed('cy')).toEqual([]);

    // what the run finds shows as it ends, no slot waited for
    cy.letGo();
    await vi.waitFor(() => expect(cy.ended).toBe(1), {
      timeout: 20_000,
      interval: 100,
    });
    expect(await listed('cy')).toEqual([[`${LMS}~c3`, [LMS]]]);
    expect(await titles('cy', `${LMS}~c3`)).toEqual(['c3-news']);
    expect(await firstSync()).toBe(false);
    await versionOf('itemVersion', 'c3-news');

    // a later run's shows at its slot
    await app
      .get(CommandBus)
      .execute(
        new SyncConnectionCommand(
          Connection.of({ portal: LMS, account: account.cy }),
        ),
      );
    await vi.waitFor(() => expect(cy.ended).toBe(2), {
      timeout: 20_000,
      interval: 100,
    });
    await versionOf('itemVersion', 'c4-news');
    expect(await listed('cy')).toEqual([[`${LMS}~c3`, [LMS]]]);
    const sight = await prisma.courseSight.findFirstOrThrow({
      where: {
        account: account.cy,
        version: { portalCourse: { portal: LMS, externalId: 'c4' } },
      },
    });
    expect(sight.shownFrom.getTime()).toBeGreaterThan(Date.now());
  });

  it('keeps one version of what both accounts see alike, and fetches its bytes once', async () => {
    expect(
      await prisma.itemVersion.count({
        where: { item: { portal: LMS, externalId: 'news' } },
      }),
    ).toBe(1);
    expect(
      await prisma.itemSight.count({ where: { versionId: version.news } }),
    ).toBe(2);
    expect(fetch).toEqual({
      'ana slides': true,
      'ana handout': true,
      'bo slides': false,
      // ana's run holds its lease
      'bo handout': false,
      'ana later': true,
    });
  });

  it('lists to each user the courses their own views hold, those parts alone', async () => {
    expect(await listed('ana')).toEqual([
      ['views-os', [LMS]],
      [`${LMS}~c2`, [LMS]],
    ]);
    expect(await listed('bo')).toEqual([['views-os', [LMS]]]);
    // the admin and a user granted the course read its shared part alone
    for (const who of ['ed', 'dee'])
      expect(await listed(who)).toEqual([['views-os', [CAMPUS]]]);
  });

  it("gives each user their own account's posts, versions and all, and nothing of another's", async () => {
    expect(sorted(await titles('ana', 'views-os'))).toEqual([
      'edited',
      'going',
      'news',
      'section',
    ]);
    expect(sorted(await titles('bo', 'views-os'))).toEqual([
      'edited since',
      'news',
      'sealed',
    ]);
    for (const who of ['ed', 'dee'])
      expect(await titles(who, 'views-os')).toEqual(['campus-news']);
    expect(await titles('ana', `${LMS}~c2`)).toEqual(['c2-news']);

    // another's post, version or course answers as one that isn't there
    const missing = await get('bo', `/api/items/${randomUUID()}`).expect(404);
    for (const id of [version.section, version.edited, version['c2-news']])
      expect((await get('bo', `/api/items/${id}`).expect(404)).body).toEqual(
        missing.body,
      );
    expect(
      (await get('bo', `/api/courses/${LMS}~c2/items`).expect(404)).body,
    ).toEqual(
      (await get('bo', `/api/courses/${LMS}~nope/items`).expect(404)).body,
    );
    expect(
      (await body('bo', `/api/items/${version['edited since']}`)).title,
    ).toBe('edited since');
  });

  it("lists a post only while the user's view shows it, and its body only once it opens it", async () => {
    const items = async (who: string) =>
      (await body(who, '/api/courses/views-os/items')) as (Listed & {
        raw: unknown;
      })[];
    const anas = await items('ana');
    for (const title of ['soon', 'gone'])
      expect(anas.map((i) => i.title)).not.toContain(title);
    // hidden from a time to come, it's shown till then
    expect(anas.find((i) => i.title === 'going')?.raw).toEqual({
      message: 'going poruka',
    });
    const missing = await get('ana', `/api/items/${randomUUID()}`).expect(404);
    for (const id of ['soon', 'gone'])
      expect(
        (await get('ana', `/api/items/${version[id]}`).expect(404)).body,
      ).toEqual(missing.body);

    // locked for bo: listed by its title, its body held back on both routes
    expect((await items('bo')).find((i) => i.title === 'sealed')).toMatchObject(
      { id: version.sealed, raw: null },
    );
    expect(await body('bo', `/api/items/${version.sealed}`)).toMatchObject({
      title: 'sealed',
      raw: null,
    });
    expect((await body('bo', `/api/items/${version.news}`)).raw).toEqual({
      message: 'news poruka',
    });
  });

  it("opens a file's content only once the user's own view does", async () => {
    const files = async (who: string) =>
      Object.fromEntries(
        ((await body(who, '/api/courses/views-os/files')) as Listed[]).map(
          (f) => [f.name, f.hasContent],
        ),
      );
    expect(await files('ana')).toEqual({
      'handout.txt': false,
      'later.txt': false,
      'slides.txt': true,
    });
    expect(await files('bo')).toEqual({
      'handout.txt': false,
      'slides.txt': false,
    });
    // the post it came with, as each one's view has it
    for (const [who, post] of [
      ['ana', version.edited],
      ['bo', version['edited since']],
    ])
      expect((await body(who, `/api/files/${version.handout}`)).itemId).toBe(
        post,
      );

    await get('ana', `/api/files/${version.slides}/content`).expect(200);
    const missing = await get(
      'bo',
      `/api/files/${randomUUID()}/content`,
    ).expect(404);
    for (const [who, id] of [
      ['bo', version.slides],
      ['ana', version.later],
    ])
      for (const path of ['content', 'text?page=1'])
        expect(
          (await get(who, `/api/files/${id}/${path}`).expect(404)).body.code,
        ).toBe(missing.body.code);
  });

  it("counts the files of a course the user's view opens, and answers 404 for one they do not read", async () => {
    // slides is the one of ana's three files whose content her view opens
    expect(await body('ana', '/api/courses/views-os/processing')).toEqual({
      total: 1,
      waiting: expect.any(Object),
    });
    // a user who reads nothing of it
    as.fay = await signUp('fay@views.test');
    await get('fay', '/api/courses/views-os/processing').expect(404);
  });

  it("searches each user's own view, what it opens alone", async () => {
    // by meaning, knn has nearest ones to every query: each user's own, and
    // no other's
    const own = {
      ana: [
        version.news,
        version.section,
        version.edited,
        version['c2-news'],
        version.going,
      ],
      bo: [version.news, version['edited since']],
    };
    for (const [who, q] of [
      ['ana', 'semafor'],
      ['bo', 'semafor'],
      ['bo', 'section'],
    ] as const)
      for (const found of await search(who, q))
        expect([
          ...own[who],
          ...(who === 'ana' ? [version.slides] : []),
        ]).toContain(found);
    // by the words alone, exactly what each one's view has
    vi.spyOn(app.get(QueryEmbedder), 'embed').mockRejectedValue(
      new EmbedderUnavailableError('embedder.invalid: ENOTFOUND'),
    );
    try {
      expect(await search('ana', 'semafor')).toEqual([version.slides]);
      expect(await search('ana', 'section')).toEqual([version.section]);
      // an admin reads every course of the other specs' shared portals too
      const anas = [version.slides, version.later, version.section];
      for (const who of ['bo', 'ed', 'dee'])
        for (const q of ['semafor', 'section'])
          for (const found of await search(who, q))
            expect(anas).not.toContain(found);
      expect(await search('bo', 'semafor')).toEqual([]);
      expect(await search('bo', 'news')).toEqual([version.news]);
      // not shown yet, hidden since, or locked: none found
      for (const q of ['soon', 'gone'])
        expect(await search('ana', q)).toEqual([]);
      expect(await search('ana', 'going')).toEqual([version.going]);
      expect(await search('bo', 'sealed')).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('lets an admin read a portal read with accounts through an account of their own, as anyone', async () => {
    await http()
      .put(`/api/me/portals/${LMS}/token`)
      .set('cookie', as.ed)
      .send({ token: `ed~${randomBytes(8).toString('hex')}` })
      .expect(204);
    account.ed = (
      await prisma.portalAccount.findFirstOrThrow({
        where: { userId: await userId('ed@views.test') },
      })
    ).id;
    const ed = ingestOf('ed');
    await ed.courses([{ externalId: 'c1', name: 'Course c1' }]);
    const eds = await ed.pass('c1');
    await eds.item(post('news'));
    await eds.end();

    expect(await listed('ed')).toEqual([['views-os', [CAMPUS, LMS]]]);
    expect(sorted(await titles('ed', 'views-os'))).toEqual([
      'campus-news',
      'news',
    ]);
    await http()
      .delete(`/api/me/portals/${LMS}/token`)
      .set('cookie', as.ed)
      .expect(204);
  });

  it('shows a portal course an admin linked before anything of it was sent, once sent, to an account that sees it', async () => {
    await http()
      .put(`/api/portal-courses/${LMS}/never-sent/course`)
      .set('cookie', as.ed)
      .send({ course: 'views-os' })
      .expect(204);
    const ana = ingestOf('ana');
    await ana.courses(
      ['c1', 'c2', 'never-sent'].map((externalId) => ({
        externalId,
        name:
          externalId === 'never-sent' ? 'Sent at last' : `Course ${externalId}`,
      })),
    );
    const sent = await ana.pass('never-sent');
    await sent.item(post('late-news'));
    await sent.end();

    const [os] = (
      (await body('ana', '/api/courses')) as {
        slug: string;
        portalCourses: { portal: string; name: string }[];
      }[]
    ).filter(({ slug }) => slug === 'views-os');
    expect(os.portalCourses).toContainEqual(
      expect.objectContaining({ portal: LMS, name: 'Sent at last' }),
    );
    expect(await titles('ana', 'views-os')).toContain('late-news');
    await http()
      .delete(`/api/portal-courses/${LMS}/never-sent/course`)
      .set('cookie', as.ed)
      .expect(204);
  });

  it("answers an admin's link the same whether the hub has the portal course or not", async () => {
    for (const externalId of ['c1', 'never-sent']) {
      await http()
        .put(`/api/portal-courses/${LMS}/${externalId}/course`)
        .set('cookie', as.ed)
        .send({ course: 'views-os' })
        .expect(204);
      await http()
        .delete(`/api/portal-courses/${LMS}/${externalId}/course`)
        .set('cookie', as.ed)
        .expect(204);
    }
    // c1 no course links now: a course of its own to who sees it
    expect(await titles('bo', `${LMS}~c1`)).toEqual(
      expect.arrayContaining(['news']),
    );
  });

  it('gives a version left without bytes those of its stamp at its next pass', async () => {
    const anas = await ingestOf('ana').pass('c1');
    await file(anas, 'ana', { externalId: 'notes' });
    await anas.end();
    const { hash } = await anas.content(
      'notes',
      Readable.from(['beleske semafora']),
    );
    // bo's, renamed: another version of the same bytes
    const renamed = { externalId: 'notes', name: 'renamed.txt', size: 16 };
    const bos = await ingestOf('bo').pass('c1');
    await bos.file(renamed);
    await bos.end();
    const his = await prisma.fileVersion.findFirstOrThrow({
      where: {
        file: { portal: LMS, externalId: 'notes' },
        name: 'renamed.txt',
      },
    });
    expect(his.contentHash).toBe(hash);
    // as one made while ana's bytes came in leaves it: the hub has them,
    // so no run fetches them for it
    await prisma.fileVersion.update({
      where: { id: his.id },
      data: { contentHash: null },
    });

    const again = await ingestOf('bo').pass('c1');
    expect(await again.file(renamed)).toEqual({ fetch: false });
    await again.end();
    expect(
      (await prisma.fileVersion.findUniqueOrThrow({ where: { id: his.id } }))
        .contentHash,
    ).toBe(hash);
  });

  it('forgets an account unlinked: its runs, and what it saw', async () => {
    await http()
      .delete(`/api/me/portals/${LMS}/token`)
      .set('cookie', as.bo)
      .expect(204);

    const queue = app.get<Queue<ConnectorJob>>(getQueueToken(CONNECTORS_QUEUE));
    const keys = (await queue.getJobSchedulers()).map((s) => s.key);
    expect(keys).toContain(`${LMS}__${account.ana}`);
    expect(keys).not.toContain(`${LMS}__${account.bo}`);
    const where = { account: account.bo };
    expect(
      await Promise.all([
        prisma.courseSight.count({ where }),
        prisma.itemSight.count({ where }),
        prisma.fileSight.count({ where }),
        prisma.accountView.count({ where }),
      ]),
    ).toEqual([0, 0, 0, 0]);
    // ana's view, the same version of a post among it, stays
    expect(
      await prisma.itemSight.count({ where: { versionId: version.news } }),
    ).toBe(1);
    // what bo alone saw is removed, and leaves the index; what ana sees too
    // stays there
    await unindexed(`post__${version.sealed}`);
    expect(
      (await opensearch.exists({ index, id: `post__${version.news}` })).body,
    ).toBe(true);
  });
});
