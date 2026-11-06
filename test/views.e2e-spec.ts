import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Client } from '@opensearch-project/opensearch';
import {
  PollConnector,
  type Credential,
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
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import {
  EmbedderUnavailableError,
  QueryEmbedder,
} from '../src/processing/application/ports.js';
import { keyId } from '../src/processing/domain/representation.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';

// A portal read with users' own accounts, as the whole app reads it: each
// user reads what their own account sees and nothing of another's, by
// every route and by search, a section's post and a file locked for one of
// them included; an admin reads it through an account of their own alone,
// and a grant gives none of it. Whose views a user reads, and how catalog
// cuts a query by them, are checked on fakes (viewers.spec.ts,
// course-reader.spec.ts, course-search.spec.ts). Until connectors send
// accounts' views (the pass API), what each account sees is written here
// as sights of the versions the shared connection sends.

const LMS = PortalId.parse('views-lms');
const CAMPUS = PortalId.parse('views-campus');
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const fakeText = PluginName.parse('fake-text');
const past = new Date('2026-01-01T00:00:00Z');
const future = new Date('2999-01-01T00:00:00Z');

// whoever's token it is, by the name before ~
@PollConnector({ portal: LMS, schedule: '0 0 1 1 *', links: ['token'] })
@Injectable()
class LmsPortal implements PollsPortal, IdentifiesAccounts {
  async poll() {}

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
  // the versions the shared connection sent, by the portal's id
  const version: Record<string, string> = {};

  const get = (who: string, path: string) =>
    http().get(path).set('cookie', as[who]);
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

  // what an account sees: a course, or a version of a post or a file
  const sees = (
    who: string,
    kind: 'course' | 'item' | 'file',
    versionId: string,
    { open = true, openFrom = past } = {},
  ) => {
    const data = {
      account: account[who],
      versionId,
      open,
      shownFrom: past,
      openFrom,
    };
    return kind === 'course'
      ? prisma.courseSight.create({ data })
      : kind === 'item'
        ? prisma.itemSight.create({ data })
        : prisma.fileSight.create({ data });
  };
  const idOf = async (
    table: 'itemVersion' | 'fileVersion',
    externalId: string,
  ) => {
    const where = { portal: LMS, externalId };
    const row =
      table === 'itemVersion'
        ? await prisma.itemVersion.findFirstOrThrow({ where: { item: where } })
        : await prisma.fileVersion.findFirstOrThrow({
            where: { file: where },
          });
    return (version[externalId] = row.id);
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

    // what the portals have: the lms's records as the shared connection
    // sends them, a campus portal read as shared
    const lms: PortalIngest = portalIngest(app, LMS);
    const campus: PortalIngest = portalIngest(app, CAMPUS);
    for (const c of ['c1', 'c2'])
      await lms.course({ externalId: c, name: `Course ${c}` });
    await campus.course({ externalId: 'campus-os', name: 'Campus OS' });
    const post = (ingest: PortalIngest, externalId: string, course: string) =>
      ingest.item({
        externalId,
        course,
        kind: 'announcement',
        title: externalId,
        raw: { message: `${externalId} poruka` },
      });
    for (const id of ['news', 'section', 'edited']) await post(lms, id, 'c1');
    await post(lms, 'c2-news', 'c2');
    await post(campus, 'campus-news', 'campus-os');
    for (const [id, text] of [
      ['slides', 'slajdovi semafor'],
      ['later', 'kasnije semafor'],
    ]) {
      await lms.file({ externalId: id, course: 'c1', name: `${id}.txt` });
      const { hash } = await lms.content(id, Readable.from([text]));
      await indexed(keyId({ hash, processor: fakeText, version: 1 }));
    }
    // a handout attached to the edited post, the same file for both
    await lms.file({ externalId: 'handout', item: 'edited', name: 'h.pdf' });

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

    // ana's account sees c1 and c2, the section's post, slides open and
    // the later file not open yet; bo's c1 alone, slides locked, and the
    // edited post as it is now, another version of it
    const courses = await prisma.portalCourse.findMany({
      where: { portal: LMS },
    });
    const of = (c: string) => courses.find((pc) => pc.externalId === c)!.id;
    for (const c of ['c1', 'c2']) await sees('ana', 'course', of(c));
    await sees('bo', 'course', of('c1'));
    for (const id of ['news', 'section', 'edited', 'c2-news'])
      await sees('ana', 'item', await idOf('itemVersion', id));
    await sees('bo', 'item', version.news);
    const edited = await prisma.itemVersion.create({
      data: {
        id: randomUUID(),
        itemId: (
          await prisma.itemVersion.findUniqueOrThrow({
            where: { id: version.edited },
          })
        ).itemId,
        portalCourseId: of('c1'),
        kind: 'announcement',
        title: 'edited since',
        raw: { message: 'edited since' },
      },
    });
    version['edited since'] = edited.id;
    await sees('bo', 'item', edited.id);
    await sees('ana', 'file', await idOf('fileVersion', 'slides'));
    await sees('bo', 'file', version.slides, { open: false });
    await sees('ana', 'file', await idOf('fileVersion', 'later'), {
      openFrom: future,
    });
    for (const who of ['ana', 'bo'])
      await sees(who, 'file', await idOf('fileVersion', 'handout'));
    for (const id of ['news', 'section']) await indexed(`post__${version[id]}`);
  }, 60_000);

  afterAll(async () => {
    // the accounts and their credentials, which other specs count
    for (const who of ['ana', 'bo'])
      await http()
        .delete(`/api/me/portals/${LMS}/token`)
        .set('cookie', as[who])
        .expect(204);
    await app.close();
    vi.unstubAllEnvs();
  });

  it('lists to each user the courses their own views hold, those parts alone', async () => {
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
          portalCourses.map((pc) => pc.portal),
        ]);

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
    expect((await titles('ana', 'views-os')).sort()).toEqual([
      'edited',
      'news',
      'section',
    ]);
    expect((await titles('bo', 'views-os')).sort()).toEqual([
      'edited since',
      'news',
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

  it("opens a file's content only once the user's own view does", async () => {
    const files = async (who: string) =>
      Object.fromEntries(
        ((await body(who, '/api/courses/views-os/files')) as Listed[]).map(
          (f) => [f.name, f.hasContent],
        ),
      );
    expect(await files('ana')).toEqual({
      'h.pdf': false,
      'later.txt': false,
      'slides.txt': true,
    });
    expect(await files('bo')).toEqual({ 'h.pdf': false, 'slides.txt': false });
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

  it("searches each user's own view, what it opens alone", async () => {
    // by meaning, knn has nearest ones to every query: each user's own, and
    // no other's
    const own = {
      ana: [version.news, version.section, version.edited, version['c2-news']],
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
    } finally {
      vi.restoreAllMocks();
    }
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
});
