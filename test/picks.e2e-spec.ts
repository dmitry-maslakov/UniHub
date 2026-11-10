import type { INestApplication } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as loader from '@grpc/proto-loader';
import type { Client as OpenSearch } from '@opensearch-project/opensearch';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { portalIngest } from './ingest.js';

// A public portal as the whole app reads it: its connector's courses are a
// catalog everyone reads, by every route, by search and by MCP, with no
// grant and no pick, and its connector is asked for all of it over gRPC
// (Wanted). A pick shows a course among the user's own, and any course of
// theirs is hidden and shown again, read all the while. Which courses a
// page of the catalog shows, which are the user's and which hidden, and
// whose views a user reads are checked on fakes (catalog-page.spec.ts,
// portal-picks.spec.ts, hidden-courses.spec.ts, grouping.spec.ts,
// course-showing.spec.ts, viewers.spec.ts); here, what the queries find,
// the routes, the limit, and a deleted user's picks and hidden courses
// going by identity's event.

const CATALOG = 'catalog';
const TOKEN = 'catalog-test-token-0001';
const SHARED = 'grpc-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// the connector, over gRPC, as one outside the hub asks
function connector() {
  const definition = loader.loadSync('proto/ingest.proto', {
    keepCase: false,
  });
  const proto = grpc.loadPackageDefinition(definition) as unknown as {
    unihub: {
      ingest: {
        v1: { Ingest: new (url: string, c: grpc.ChannelCredentials) => Client };
      };
    };
  };
  return new proto.unihub.ingest.v1.Ingest(
    testEnv.GRPC_URL,
    grpc.credentials.createInsecure(),
  );
}
type Client = grpc.Client & {
  Wanted: (
    request: object,
    metadata: grpc.Metadata,
    callback: (err: grpc.ServiceError | null, out: object) => void,
  ) => void;
};

describe('public portals and picks', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let opensearch: OpenSearch;
  let client: Client;
  const mails: Mail[] = [];
  const { http, post, signUp, userId, makeAdmin, ban } = accounts(
    () => app,
    mails,
  );
  const as: Record<string, string> = {};
  // the posts' ids, by the portal's
  const posts: Record<string, string> = {};

  const get = (who: string, path: string) =>
    http().get(path).set('cookie', as[who]);
  const body = async (who: string, path: string) =>
    (await get(who, path).expect(200)).body;
  const pick = (who: string, course: string, portal = CATALOG) =>
    http().put(`/api/me/picks/${portal}/${course}`).set('cookie', as[who]);
  const unpick = (who: string, course: string, portal = CATALOG) =>
    http().delete(`/api/me/picks/${portal}/${course}`).set('cookie', as[who]);
  const hide = (who: string, slug: string) =>
    http().put(`/api/courses/${slug}/hidden`).set('cookie', as[who]);
  const show = (who: string, slug: string) =>
    http().delete(`/api/courses/${slug}/hidden`).set('cookie', as[who]);
  // the slugs of the catalog's courses among a user's own
  const slugs = async (who: string) =>
    ((await body(who, '/api/courses')) as { slug: string }[])
      .map(({ slug }) => slug)
      .filter((slug) => slug.startsWith(`${CATALOG}~`) || slug === 'networks');
  const wanted = (token = TOKEN) =>
    new Promise<string[]>((resolve, reject) => {
      const metadata = new grpc.Metadata();
      metadata.set('authorization', `Bearer ${token}`);
      client.Wanted({}, metadata, (err, out) =>
        err
          ? reject(err)
          : resolve(
              ((out as { externalIds?: string[] }).externalIds ?? []).sort(),
            ),
      );
    });

  beforeAll(async () => {
    vi.stubEnv('PORTAL_LINKS', `${CATALOG}=public`);
    vi.stubEnv('PORTAL_LABELS', `${CATALOG}=Course catalog`);
    vi.stubEnv(
      'CONNECTOR_TOKENS',
      `${SHARED}=good-test-token-0001, ${CATALOG}=${TOKEN}`,
    );
    app = await bootApp({ mails });
    prisma = app.get(PrismaService);
    opensearch = app.get(OPENSEARCH);
    client = connector();

    // the connector's catalog, and a post of each course
    const site = portalIngest(app, CATALOG);
    await site.course({
      externalId: 'os',
      name: 'Operativni sistemi',
      url: 'https://courses.example.edu/os',
    });
    await site.course({ externalId: 'net', name: 'Računarske mreže' });
    for (const [externalId, course, title] of [
      ['os-exam', 'os', 'Kolokvijum iz semafora'],
      ['net-exam', 'net', 'Kolokvijum iz rutiranja'],
    ]) {
      await site.item({
        externalId,
        course,
        kind: 'announcement',
        title,
        raw: { message: title },
      });
      posts[externalId] = (
        await prisma.item.findFirstOrThrow({
          where: { portal: CATALOG, externalId },
        })
      ).id;
    }
    await site.file({ externalId: 'os-slides', course: 'os', name: 'l1.pdf' });
    // a course of a shared portal
    await portalIngest(app, SHARED).course({
      externalId: 'shared-c1',
      name: 'Shared',
    });

    for (const who of ['ana', 'bo', 'ed', 'cy', 'di'])
      as[who] = await signUp(`${who}@picks.test`);
    await makeAdmin('ed@picks.test');
  });

  afterAll(async () => {
    client.close();
    await app.close();
    vi.unstubAllEnvs();
  });

  it('browses the catalog, picks and unpicks, and counts the picks', async () => {
    expect(
      await body('ana', `/api/portals/${CATALOG}/catalog?q=MREZE`),
    ).toEqual({
      total: 1,
      courses: [
        {
          externalId: 'net',
          name: 'Računarske mreže',
          url: null,
          picked: false,
          isNew: true,
          into: null,
          suggestedInto: null,
        },
      ],
    });

    await pick('ana', 'os').send({}).expect(204);
    // again, and without a body: no new pick
    await pick('ana', 'os').expect(204);
    expect(
      (await body('ana', `/api/portals/${CATALOG}/catalog?limit=1`)).courses,
    ).toEqual([expect.objectContaining({ externalId: 'os', picked: true })]);
    expect(await body('ana', '/api/me/portals')).toEqual([
      {
        portal: CATALOG,
        label: 'Course catalog',
        mode: 'public',
        linked: false,
        instance: null,
        status: null,
        expiresAt: null,
        picked: 1,
        firstSync: false,
      },
    ]);

    // nothing else to pick, nor a catalog of a portal not public
    await pick('ana', 'gone').expect(404);
    await pick('ana', 'shared-c1', SHARED).expect(404);
    await get('ana', `/api/portals/${SHARED}/catalog`).expect(404);
    await get('ana', `/api/portals/${CATALOG}/catalog?limit=201`).expect(400);
    await pick('ana', 'os', 'NotAPortal').expect(400);
    await unpick('ana', 'os', 'NotAPortal').expect(400);

    await unpick('ana', 'os').expect(204);
    await unpick('ana', 'os').expect(204);
    expect((await body('ana', '/api/me/portals'))[0].picked).toBe(0);
  });

  it("reads the catalog's courses by every route and search, with no grant and no pick, and lists the ones picked", async () => {
    const os = `${CATALOG}~os`;
    // nothing picked: none among her courses, all hers to read
    expect(await slugs('ana')).toEqual([]);
    expect(await body('ana', `/api/courses/${os}`)).toEqual({
      slug: os,
      name: 'Operativni sistemi',
      sources: [CATALOG],
      portalCourses: [
        {
          portal: CATALOG,
          externalId: 'os',
          name: 'Operativni sistemi',
          url: 'https://courses.example.edu/os',
          year: null,
          via: 'public',
        },
      ],
      hidden: true,
    });
    const items = await body('ana', `/api/courses/${os}/items`);
    expect(items.map((i: { id: string }) => i.id)).toEqual([posts['os-exam']]);
    expect(items[0].raw).toEqual({ message: 'Kolokvijum iz semafora' });
    expect(
      (await body('ana', `/api/courses/${os}/files`)).map(
        (f: { name: string }) => f.name,
      ),
    ).toEqual(['l1.pdf']);
    await get('ana', `/api/items/${posts['net-exam']}`).expect(200);
    await get('ana', `/api/courses/${CATALOG}~gone`).expect(404);

    // search finds every course's post, and with `shown` those of the
    // courses among hers alone
    for (const id of Object.values(posts))
      await vi.waitFor(
        async () =>
          expect(
            (
              await opensearch.exists({
                index,
                id: `post__${id}`,
                realtime: false,
              })
            ).body,
          ).toBe(true),
        { timeout: 20_000, interval: 200 },
      );
    const found = async (who: string, more = '') =>
      (
        (await body(who, `/api/search?q=kolokvijum${more}`)).results as {
          itemId: string;
          courseName: string;
        }[]
      )
        .map((r) => `${r.courseName}: ${r.itemId}`)
        .sort(byText);
    const both = [
      `Operativni sistemi: ${posts['os-exam']}`,
      `Računarske mreže: ${posts['net-exam']}`,
    ];
    expect(await found('ana')).toEqual(both);
    expect(await found('ana', '&shown=true')).toEqual([]);

    await pick('ana', 'os').expect(204);
    expect(await slugs('ana')).toEqual([os]);
    expect(
      ((await body('ana', '/api/courses')) as { slug: string }[]).find(
        (c) => c.slug === os,
      ),
    ).toMatchObject({ hidden: false, portalCourses: [{ via: 'public' }] });
    expect(await found('ana')).toEqual(both);
    expect(await found('ana', '&shown=true')).toEqual([both[0]]);

    // and MCP, as an agent of hers reads: her courses listed, all searched
    const key = (
      await post('/api-key/create', { name: 'agent' }, as.ana).expect(200)
    ).body.key as string;
    const call = async (name: string, args: object) =>
      (
        await http()
          .post('/api/mcp')
          .set('accept', 'application/json, text/event-stream')
          .set('x-api-key', key)
          .send({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name, arguments: args },
          })
          .expect(200)
      ).body.result.content[0].text as string;
    const listed = await call('list_courses', {});
    expect(listed).toContain(os);
    expect(listed).not.toContain(`${CATALOG}~net`);
    const searched = await call('search', { q: 'kolokvijum' });
    expect(searched).toContain(posts['net-exam']);
    expect(await call('list_items', { course: `${CATALOG}~net` })).toContain(
      posts['net-exam'],
    );

    // an admin as anyone
    expect(await slugs('ed')).toEqual([]);
    await get('ed', `/api/courses/${os}/items`).expect(200);
    // banned, nothing
    await ban('ana@picks.test');
    expect(await slugs('ana')).toEqual([]);
    await get('ana', `/api/items/${posts['os-exam']}`).expect(404);
    await get('ana', `/api/courses/${os}`).expect(404);
    await ban('ana@picks.test', false);
    await unpick('ana', 'os').expect(204);
  });

  it('hides a course and shows it again, read all the while, and shows one not picked by picking it', async () => {
    const os = `${CATALOG}~os`;
    const hidden = async (who: string) =>
      Object.fromEntries(
        ((await body(who, '/api/courses')) as CourseState[])
          .filter(({ slug }) => slug.startsWith(`${CATALOG}~`))
          .map(({ slug, hidden }) => [slug, hidden]),
      );
    type CourseState = { slug: string; hidden: boolean };
    await pick('bo', 'os').expect(204);
    await hide('bo', os).expect(204);
    await hide('bo', os).expect(204);
    // among his courses still, and picked
    expect(await hidden('bo')).toEqual({ [os]: true });
    expect((await body('bo', '/api/me/portals'))[0].picked).toBe(1);
    await get('bo', `/api/courses/${os}/items`).expect(200);
    await get('bo', `/api/items/${posts['os-exam']}`).expect(200);
    expect(
      (await body('bo', '/api/search?q=kolokvijum&shown=true')).results,
    ).toEqual([]);
    expect(
      (await body('bo', `/api/search?q=kolokvijum&shown=true&course=${os}`))
        .results,
    ).toHaveLength(1);
    // nobody else's
    await pick('ana', 'os').expect(204);
    expect(await hidden('ana')).toEqual({ [os]: false });

    await show('bo', os).expect(204);
    expect(await hidden('bo')).toEqual({ [os]: false });
    // one not picked is hidden as it is, and shown by its pick
    const net = `${CATALOG}~net`;
    await hide('bo', net).expect(204);
    expect(await hidden('bo')).toEqual({ [os]: false });
    await show('bo', net).expect(204);
    expect(await hidden('bo')).toEqual({ [os]: false, [net]: false });
    expect((await body('bo', '/api/me/portals'))[0].picked).toBe(2);
    // picked again in the catalog, a hidden course is shown
    await hide('bo', net).expect(204);
    await pick('bo', 'net').expect(204);
    expect(await hidden('bo')).toMatchObject({ [net]: false });

    await hide('bo', `${CATALOG}~gone`).expect(404);
    await show('bo', `${CATALOG}~gone`).expect(404);
    await hide('bo', 'Not A Slug').expect(400);
    for (const course of ['os', 'net']) await unpick('bo', course).expect(204);
    await unpick('ana', 'os').expect(204);
  });

  it('reads a course of the catalog inside the course an admin linked it to, among the courses of who picked it or was granted it', async () => {
    const created = await http()
      .post('/api/courses')
      .set('cookie', as.ed)
      .send({ slug: 'networks', name: 'Networks' })
      .expect(201);
    await http()
      .put(`/api/portal-courses/${CATALOG}/net/course`)
      .set('cookie', as.ed)
      .send({ course: 'networks' })
      .expect(204);
    await http()
      .put(
        `/api/users/${await userId('cy@picks.test')}/courses/${created.body.id}`,
      )
      .set('cookie', as.ed)
      .expect(204);
    const netPosts = async (who: string) =>
      (await body(who, '/api/courses/networks/items')).map(
        (i: { id: string }) => i.id,
      );

    // everyone reads it there, its own slug no course's now
    expect(await netPosts('di')).toEqual([posts['net-exam']]);
    await get('di', `/api/courses/${CATALOG}~net`).expect(404);
    expect(await slugs('di')).toEqual([]);
    await pick('bo', 'net').expect(204);
    expect(await slugs('bo')).toEqual(['networks']);
    // granted, not picked
    expect(await slugs('cy')).toEqual(['networks']);
    expect(await netPosts('cy')).toEqual([posts['net-exam']]);
    await unpick('bo', 'net').expect(204);
  });

  it('asks the connector for its whole catalog, picked or not, and nothing of another portal', async () => {
    expect(await wanted()).toEqual(['net', 'os']);
    expect(await wanted('good-test-token-0001')).toEqual([]);
  });

  it("removes a deleted user's picks and hidden courses with them", async () => {
    await pick('ana', 'os').expect(204);
    await hide('ana', `${CATALOG}~os`).expect(204);
    await pick('bo', 'os').expect(204);
    await post(
      '/admin/remove-user',
      { userId: await userId('ana@picks.test') },
      as.ed,
    ).expect(200);
    await vi.waitFor(async () => {
      expect(await prisma.pick.count()).toBe(1);
      expect(await prisma.hiddenCourse.count()).toBe(0);
    });
    await unpick('bo', 'os').expect(204);
  });

  it('takes no more than 30 picks and unpicks a minute', async () => {
    for (let i = 0; i < 29; i++) await unpick('cy', 'os').expect(204);
    const last = await unpick('cy', 'os').expect(204);
    expect(last.headers['x-ratelimit-remaining-picks']).toBe('0');
    await pick('cy', 'os').expect(429);
  });
});
