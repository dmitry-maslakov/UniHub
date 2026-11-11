import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import type { Client as OpenSearch } from '@opensearch-project/opensearch';
import {
  PollConnector,
  type Credential,
  type IdentifiesAccounts,
  type PollsPortal,
  type PortalIngest,
  type PortalUser,
} from '@app/plugin-sdk';
import type { Mail } from '../src/identity/domain/mailer.js';
import {
  Connection,
  IngestService,
  SdkPortalIngest,
} from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { portalIngest } from './ingest.js';

// A pick shown with a course of the user's own, as the whole app reads it:
// the route that sets it and refuses a course not theirs, the courses
// regrouped by every route, by search and by MCP, and the catalog's
// suggestion counted from the user's own view alone. Where a pick goes and
// what's suggested are checked on fakes (grouping.spec.ts,
// suggestions.spec.ts, course-matching.spec.ts, portal-picks.spec.ts);
// here, what the queries find and the wiring.

const LMS = 'matching-lms';
const SITE = 'matching-site';
const TOKEN = 'matching-site-token-0001';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const past = new Date('2026-01-01T00:00:00Z');
const [SLIDES, LABS, EXAM] = ['slides', 'labs', 'exam'].map(
  (what) => `%PDF ${what} of operating systems`,
);

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
  slug: string;
  sources: string[];
  portalCourses: { portal: string; via: string }[];
}

describe('picks shown with courses of their own', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opensearch: OpenSearch;
  const mails: Mail[] = [];
  const { http, post, signUp, userId } = accounts(() => app, mails);
  const as: Record<string, string> = {};
  const account: Record<string, string> = {};
  let exam: string;
  // the index's manifests of the files the accounts saw
  let accountFiles: string[] = [];

  const get = (who: string, path: string) =>
    http().get(path).set('cookie', as[who]);
  const body = async (who: string, path: string) =>
    (await get(who, path).expect(200)).body;
  const pick = (who: string, course: string) =>
    http().put(`/api/me/picks/${SITE}/${course}`).set('cookie', as[who]);
  // the user's courses of this spec, each with its portal courses' ways in
  const listed = async (who: string) =>
    ((await body(who, '/api/courses')) as Listed[])
      .filter(({ slug }) => slug.startsWith('matching-'))
      .map(({ slug, sources, portalCourses }) => ({
        slug,
        sources,
        via: portalCourses.map(({ portal, via }) => `${portal} ${via}`),
      }));
  const catalog = async (who: string) =>
    (
      (await body(who, `/api/portals/${SITE}/catalog`)).courses as {
        externalId: string;
        into: string | null;
        suggestedInto: string | null;
      }[]
    ).map(({ externalId, into, suggestedInto }) => ({
      externalId,
      into,
      suggestedInto,
    }));
  // a record in the search index, or not, once it's searchable
  const inIndex = (id: string, there: boolean) =>
    vi.waitFor(
      async () =>
        expect(
          (await opensearch.exists({ index, id, realtime: !there })).body,
        ).toBe(there),
      { timeout: 20_000, interval: 200 },
    );
  // what a run of the user's account sends, shown and open from a time past
  const ingestOf = (who: string): PortalIngest =>
    new SdkPortalIngest(
      app.get(IngestService),
      Connection.of({ portal: LMS, account: account[who] }),
      new AbortController().signal,
      { shown: () => ({ shownFrom: past, openFrom: past }), leaseMs: 60_000 },
    );

  beforeAll(async () => {
    vi.stubEnv('PORTAL_LINKS', `${LMS}=token, ${SITE}=public`);
    vi.stubEnv(
      'CONNECTOR_TOKENS',
      `grpc-test=good-test-token-0001, ${SITE}=${TOKEN}`,
    );
    vi.stubEnv(
      'PORTAL_CREDENTIALS_SECRETS',
      `1:${randomBytes(32).toString('base64')}`,
    );
    app = await bootApp({ mails, imports: [LmsModule] });
    prisma = app.get(PrismaService);
    opensearch = app.get(OPENSEARCH);

    // ana and bo link accounts of their own; cy has none
    for (const who of ['ana', 'bo', 'cy'])
      as[who] = await signUp(`${who}@matching.test`);
    for (const who of ['ana', 'bo']) {
      await http()
        .put(`/api/me/portals/${LMS}/token`)
        .set('cookie', as[who])
        .send({ token: `${who}~${randomBytes(8).toString('hex')}` })
        .expect(204);
      account[who] = (
        await prisma.portalAccount.findFirstOrThrow({
          where: { userId: await userId(`${who}@matching.test`) },
        })
      ).id;
    }

    // both their accounts see c1 and its slides; ana's the labs too
    for (const who of ['ana', 'bo']) {
      const ingest = ingestOf(who);
      await ingest.courses([{ externalId: 'c1', name: 'Operating systems' }]);
      const pass = await ingest.pass('c1');
      const files = who === 'ana' ? ['slides', 'labs'] : ['slides'];
      for (const externalId of files)
        await pass.file({ externalId, name: `${externalId}.pdf`, size: 16 });
      await pass.end();
      if (who === 'ana')
        for (const [externalId, content] of [
          ['slides', SLIDES],
          ['labs', LABS],
        ])
          await pass.content(externalId, Readable.from([content]));
    }

    // the site: os holds the same slides and labs, and an exam of its own;
    // net nothing of theirs
    const site = portalIngest(app, SITE);
    await site.course({ externalId: 'os', name: 'Operativni sistemi' });
    await site.course({ externalId: 'net', name: 'Računarske mreže' });
    await site.item({
      externalId: 'os-exam',
      course: 'os',
      kind: 'announcement',
      title: 'Matching kolokvijum',
      raw: { message: 'Matching kolokvijum' },
    });
    for (const [externalId, content] of [
      ['os-slides', SLIDES],
      ['os-labs', LABS],
      ['os-exam', EXAM],
    ]) {
      await site.file({ externalId, course: 'os', name: `${externalId}.pdf` });
      await site.content(externalId, Readable.from([content]));
    }
    exam = (
      await prisma.item.findFirstOrThrow({
        where: { portal: SITE, externalId: 'os-exam' },
      })
    ).id;
    // the post and every file in the index, by name, before anything reads:
    // the files of the accounts leave it as they're unlinked (afterAll)
    accountFiles = (
      await prisma.fileVersion.findMany({
        where: { file: { portal: LMS } },
        select: { id: true },
      })
    ).map(({ id }) => `file__${id}`);
    const siteFiles = await prisma.fileVersion.findMany({
      where: { file: { portal: SITE } },
      select: { id: true },
    });
    for (const id of [
      `post__${exam}`,
      ...accountFiles,
      ...siteFiles.map(({ id }) => `file__${id}`),
    ])
      await inIndex(id, true);

    for (const who of ['ana', 'bo'])
      for (const course of ['os', 'net']) await pick(who, course).expect(204);
  }, 60_000);

  afterAll(async () => {
    // the picks and the accounts, which other specs count
    await prisma.pick.deleteMany();
    for (const who of ['ana', 'bo'])
      await http()
        .delete(`/api/me/portals/${LMS}/token`)
        .set('cookie', as[who])
        .expect(204);
    // and what they saw out of the index, by this app, so no spec after it
    // starts behind its removals
    for (const id of accountFiles) await inIndex(id, false);
    await app.close();
    vi.unstubAllEnvs();
  }, 60_000);

  it('suggests the course of her own sharing two files, counting what each user sees alone', async () => {
    expect(await catalog('ana')).toEqual([
      { externalId: 'os', into: null, suggestedInto: `${LMS}~c1` },
      { externalId: 'net', into: null, suggestedInto: null },
    ]);
    // the labs are in c1 for ana's account, not bo's: the slides alone
    expect(await catalog('bo')).toEqual([
      { externalId: 'os', into: null, suggestedInto: null },
      { externalId: 'net', into: null, suggestedInto: null },
    ]);
    // none picked, none to show with
    expect((await catalog('cy')).map((c) => c.suggestedInto)).toEqual([
      null,
      null,
    ]);
  });

  it("refuses a course that isn't one she reads through her own account, and picks nothing then", async () => {
    for (const into of ['nope', `${SITE}~net`]) {
      const refused = await pick('ana', 'os').send({ into }).expect(422);
      expect(refused.body).toMatchObject({ code: 'NOT_YOUR_COURSE' });
    }
    await pick('ana', 'os').send({ into: 'Not A Slug' }).expect(400);
    await pick('cy', 'os')
      .send({ into: `${LMS}~c1` })
      .expect(422);
    expect(
      await prisma.pick.count({
        where: { userId: await userId('cy@matching.test') },
      }),
    ).toBe(0);
  });

  it('shows the pick inside her course by every route, search and MCP, until she shows it on its own again', async () => {
    const own = `${LMS}~c1`;
    await pick('ana', 'os').send({ into: own }).expect(204);
    // picked again with no word of where: as it was
    await pick('ana', 'os').expect(204);

    expect(await listed('ana')).toEqual([
      {
        slug: own,
        sources: [LMS, SITE],
        via: [`${LMS} account`, `${SITE} public`],
      },
      { slug: `${SITE}~net`, sources: [SITE], via: [`${SITE} public`] },
    ]);
    expect((await catalog('ana'))[0]).toEqual({
      externalId: 'os',
      into: own,
      suggestedInto: own,
    });
    // bo's are his
    expect((await listed('bo')).map(({ slug }) => slug)).toEqual([
      own,
      `${SITE}~net`,
      `${SITE}~os`,
    ]);

    // its posts and files in her course, and none by its own slug
    expect(
      (await body('ana', `/api/courses/${own}/items`)).map(
        (i: { id: string }) => i.id,
      ),
    ).toEqual([exam]);
    expect(
      (await body('ana', `/api/courses/${own}/files`))
        .map((f: { name: string }) => f.name)
        .sort(),
    ).toEqual([
      'labs.pdf',
      'os-exam.pdf',
      'os-labs.pdf',
      'os-slides.pdf',
      'slides.pdf',
    ]);
    await get('ana', `/api/courses/${SITE}~os/items`).expect(404);
    const found = (
      await body('ana', '/api/search?q=matching%20kolokvijum')
    ).results.find((r: { itemId?: string }) => r.itemId === exam);
    expect(found).toMatchObject({ type: 'post', course: own });

    // and MCP, as an agent of hers lists them
    const key = (
      await post('/api-key/create', { name: 'agent' }, as.ana).expect(200)
    ).body.key as string;
    const listedByMcp = await http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('x-api-key', key)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_courses', arguments: {} },
      })
      .expect(200);
    const courses = JSON.parse(
      listedByMcp.body.result.content[0].text,
    ) as Listed[];
    expect(courses.find(({ slug }) => slug === own)?.sources).toEqual([
      LMS,
      SITE,
    ]);
    expect(courses.map(({ slug }) => slug)).not.toContain(`${SITE}~os`);

    await pick('ana', 'os').send({ into: null }).expect(204);
    expect((await listed('ana')).map(({ slug }) => slug)).toEqual([
      own,
      `${SITE}~net`,
      `${SITE}~os`,
    ]);
    expect((await catalog('ana'))[0].into).toBeNull();
  });
});
