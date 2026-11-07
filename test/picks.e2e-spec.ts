import type { INestApplication } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as loader from '@grpc/proto-loader';
import type { Client as OpenSearch } from '@opensearch-project/opensearch';
import { PortalPicks } from '../src/accounts/application/portal-picks.js';
import { WantedCourseRepository } from '../src/accounts/domain/wanted-course.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { portalIngest } from './ingest.js';

// A public portal as the whole app reads it: its connector's courses are a
// catalog each user picks from, a pick reads its course by every route, by
// search and by MCP with no grant, and asks the connector for it over gRPC
// (Wanted) through its grace. Which courses a page of the catalog shows,
// the limit of picks, when a course stops being wanted and whose views a
// user reads are checked on fakes (catalog-page.spec.ts, picks.spec.ts,
// wanted-course.spec.ts, portal-picks.spec.ts, viewers.spec.ts); here,
// what the queries find, the routes, the limits, the locks, and a deleted
// user's picks going by identity's event.

const CATALOG = 'catalog';
const TOKEN = 'catalog-test-token-0001';
const SHARED = 'grpc-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
const DAY = 24 * 60 * 60 * 1000;

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
  // the slugs of the catalog's courses a user reads
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

  it('reads a picked course by every route and search, with no grant, and nothing unpicked', async () => {
    await pick('ana', 'os').expect(204);
    expect(await slugs('ana')).toEqual([`${CATALOG}~os`]);
    const [os] = (await body('ana', '/api/courses')) as {
      slug: string;
      name: string;
      portalCourses: object[];
    }[];
    expect(os).toEqual({
      slug: `${CATALOG}~os`,
      name: 'Operativni sistemi',
      sources: [CATALOG],
      portalCourses: [
        {
          portal: CATALOG,
          externalId: 'os',
          name: 'Operativni sistemi',
          url: 'https://courses.example.edu/os',
          year: null,
          via: 'pick',
        },
      ],
    });
    const items = await body('ana', `/api/courses/${CATALOG}~os/items`);
    expect(items.map((i: { id: string }) => i.id)).toEqual([posts['os-exam']]);
    expect(items[0].raw).toEqual({ message: 'Kolokvijum iz semafora' });
    expect(
      (await body('ana', `/api/courses/${CATALOG}~os/files`)).map(
        (f: { name: string }) => f.name,
      ),
    ).toEqual(['l1.pdf']);
    await get('ana', `/api/items/${posts['os-exam']}`).expect(200);
    await get('ana', `/api/items/${posts['net-exam']}`).expect(404);
    await get('ana', `/api/courses/${CATALOG}~net/items`).expect(404);

    // search finds the picked course's post alone
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
    const found = async (who: string) =>
      (
        (await body(who, '/api/search?q=kolokvijum')).results as {
          itemId: string;
        }[]
      ).map((r) => r.itemId);
    expect(await found('ana')).toEqual([posts['os-exam']]);
    expect(await found('bo')).toEqual([]);

    // and MCP, as an agent of hers reads
    const key = (
      await post('/api-key/create', { name: 'agent' }, as.ana).expect(200)
    ).body.key as string;
    const listed = await http()
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
    expect(listed.body.result.content[0].text).toContain(`${CATALOG}~os`);

    // no pick, nothing: an admin's too
    expect(await slugs('bo')).toEqual([]);
    expect(await slugs('ed')).toEqual([]);
    await get('ed', `/api/courses/${CATALOG}~os/items`).expect(404);
    // banned, nothing of her picks either
    await ban('ana@picks.test');
    expect(await slugs('ana')).toEqual([]);
    await get('ana', `/api/items/${posts['os-exam']}`).expect(404);
    await ban('ana@picks.test', false);
    await unpick('ana', 'os').expect(204);
  });

  it('reads a picked course inside the course an admin linked it to, and a grant gives nothing of it', async () => {
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

    await pick('bo', 'net').expect(204);
    expect(await slugs('bo')).toEqual(['networks']);
    expect(
      (await body('bo', '/api/courses/networks/items')).map(
        (i: { id: string }) => i.id,
      ),
    ).toEqual([posts['net-exam']]);
    // granted, not picked
    expect(await body('cy', '/api/courses/networks/items')).toEqual([]);
    await unpick('bo', 'net').expect(204);
  });

  it('answers the connector what its users want, through the grace, and nothing of another portal', async () => {
    await pick('ana', 'os').expect(204);
    await pick('bo', 'net').expect(204);
    expect(await wanted()).toEqual(['net', 'os']);
    expect(await wanted('good-test-token-0001')).toEqual([]);

    // bo's last pick of net gone: wanted through its grace, then no more
    await unpick('bo', 'net').expect(204);
    expect(await wanted()).toEqual(['net', 'os']);
    await app.get(PortalPicks).reconcile(new Date(Date.now() + 15 * DAY));
    expect(await wanted()).toEqual(['os']);

    // ana deleted by an admin, her picks with her, and os's grace starts
    await post(
      '/admin/remove-user',
      { userId: await userId('ana@picks.test') },
      as.ed,
    ).expect(200);
    await vi.waitFor(async () => {
      expect(await prisma.pick.count()).toBe(0);
      const [os] = await prisma.wantedCourse.findMany();
      expect(os.until!.getTime()).toBeGreaterThan(Date.now() + 13 * DAY);
    });
    expect(await wanted()).toEqual(['os']);
  });

  it('lets a pick made while the reconcile looks win over it', async () => {
    const os = await prisma.portalCourse.findFirstOrThrow({
      where: { portal: CATALOG, externalId: 'os' },
    });
    await prisma.wantedCourse.update({
      where: { portalCourseId: os.id },
      data: { until: new Date(Date.now() - DAY) },
    });
    const repository = app.get(WantedCourseRepository);
    const all = repository.all.bind(repository);
    vi.spyOn(repository, 'all').mockImplementationOnce(async () => {
      const found = await all();
      await pick('bo', 'os').expect(204);
      return found;
    });

    await app.get(PortalPicks).reconcile();
    expect(
      await prisma.wantedCourse.findUnique({
        where: { portalCourseId: os.id },
      }),
    ).toEqual({ portalCourseId: os.id, until: null });
    await unpick('bo', 'os').expect(204);
  });

  it('refuses a pick past 100 with its code, of two at once too, and more than 30 a minute', async () => {
    // a hundred more courses in the catalog, picked by cy, and all but one
    // by di
    const site = portalIngest(app, CATALOG);
    const many = Array.from({ length: 100 }, (_, i) => `many-${i}`);
    for (const externalId of many)
      await site.course({ externalId, name: `Kurs ${externalId}` });
    const ids = await prisma.portalCourse.findMany({
      where: { portal: CATALOG, externalId: { in: many } },
      select: { id: true },
    });
    const [cy, di] = await Promise.all(
      ['cy', 'di'].map((who) => userId(`${who}@picks.test`)),
    );
    await prisma.pick.createMany({
      data: [
        ...ids.map(({ id }) => ({ userId: cy, portalCourseId: id })),
        ...ids.slice(1).map(({ id }) => ({ userId: di, portalCourseId: id })),
      ],
    });
    const refused = await pick('cy', 'os').expect(422);
    expect(refused.body).toMatchObject({ code: 'TOO_MANY_PICKS' });
    // di's two at once: the user's lock lets one find room, not both
    const both = await Promise.all([pick('di', 'os'), pick('di', 'net')]);
    expect(both.map(({ status }) => status).sort((a, b) => a - b)).toEqual([
      204, 422,
    ]);
    expect(await prisma.pick.count({ where: { userId: di } })).toBe(100);
    await prisma.pick.deleteMany({ where: { userId: cy } });

    // the refused pick counted too: 28 more, and the 30th
    for (let i = 0; i < 28; i++) await unpick('cy', 'os').expect(204);
    const last = await unpick('cy', 'os').expect(204);
    expect(last.headers['x-ratelimit-remaining-picks']).toBe('0');
    await pick('cy', 'os').expect(429);
  });
});
