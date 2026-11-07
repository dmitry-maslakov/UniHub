import { randomBytes } from 'node:crypto';
import { Injectable, Module, type INestApplication } from '@nestjs/common';
import {
  PollConnector,
  type IdentifiesAccounts,
  type PollsPortal,
} from '@app/plugin-sdk';
import type { Mail } from '../src/identity/domain/mailer.js';
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';
import { portalIngest } from './ingest.js';

// Each admin route once, behind its role. What a request may hold is
// checked on its schema (catalog's values.spec and requests.spec), what a
// command refuses on fakes (course.handlers.spec); a route declares which
// schema it takes, so one bad request each shows it is there.

const PORTAL = 'admin-test';
// read with users' own accounts, and a public one
const OWN = 'admin-own';
const OPEN = 'admin-open';

// the connector of the portal read with users' own accounts
@PollConnector({ portal: OWN, schedule: '0 0 1 1 *', links: ['token'] })
@Injectable()
class OwnPortal implements PollsPortal, IdentifiesAccounts {
  async poll() {}

  async identify() {
    return { id: '1', expiresAt: null };
  }
}

@Module({ providers: [OwnPortal] })
class OwnPluginsModule {}

describe('course admin routes', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin, userId, ban } = accounts(() => app, mails);
  const as = (cookie: string) => ({
    post: (path: string, body: object) =>
      http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body),
    put: (path: string, body: object) =>
      http().put(path).set('origin', ORIGIN).set('cookie', cookie).send(body),
    delete: (path: string) =>
      http().delete(path).set('origin', ORIGIN).set('cookie', cookie),
    get: (path: string) => http().get(path).set('cookie', cookie),
  });
  const link = `/api/portal-courses/${PORTAL}/1388/course`;

  let admin: ReturnType<typeof as>;
  let student: ReturnType<typeof as>;

  beforeAll(async () => {
    vi.stubEnv('PORTAL_LINKS', `${OWN}=token, ${OPEN}=public`);
    vi.stubEnv('PORTAL_LABELS', `${OPEN}=Course catalog`);
    vi.stubEnv(
      'PORTAL_CREDENTIALS_SECRETS',
      `1:${randomBytes(32).toString('base64')}`,
    );
    vi.stubEnv(
      'CONNECTOR_TOKENS',
      `grpc-test=good-test-token-0001, ${OPEN}=open-test-token-0001`,
    );
    app = await bootApp({ mails, imports: [OwnPluginsModule] });

    await portalIngest(app, PORTAL).course({
      externalId: '1388',
      name: 'OS 2026/27',
    });
    await portalIngest(app, OPEN).course({
      externalId: 'open-1',
      name: 'Kriptografija admina',
    });
    await portalIngest(app, OWN).course({
      externalId: 'own-1',
      name: 'Somebody mreže',
    });
    student = as(await signUp('student@admin.test'));
    admin = as(await signUp('admin@admin.test'));
    await makeAdmin('admin@admin.test');
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('lets only admins in', async () => {
    await http().post('/api/courses').send({}).expect(401);
    await student
      .post('/api/courses', { slug: 'admin-os', name: 'Operativni sistemi' })
      .expect(403);
  });

  it('makes a course, once per slug', async () => {
    const created = await admin
      .post('/api/courses', { slug: 'admin-os', name: ' Operativni sistemi ' })
      .expect(201);
    expect(created.body).toEqual({ id: expect.any(String) });

    await admin
      .post('/api/courses', { slug: 'admin-os', name: 'again' })
      .expect(409);
    await admin.post('/api/courses', { slug: 'Not A Slug' }).expect(400);
  });

  it('links a portal course to a course and unlinks it', async () => {
    await admin.put(link, { course: 'admin-os', year: 2026 }).expect(204);
    const courses = await admin.get('/api/courses').expect(200);
    expect(courses.body).toContainEqual({
      slug: 'admin-os',
      name: 'Operativni sistemi',
      sources: [PORTAL],
      portalCourses: [
        {
          portal: PORTAL,
          externalId: '1388',
          name: 'OS 2026/27',
          url: null,
          year: 2026,
          via: 'link',
        },
      ],
    });

    await admin.delete(link).expect(204);
    const after = await admin.get('/api/courses').expect(200);
    expect(after.body).toContainEqual(
      expect.objectContaining({ slug: 'admin-os', portalCourses: [] }),
    );
  });

  it('checks a portal course named against its schema', async () => {
    await admin
      .put('/api/portal-courses/Not_A_Portal/1388/course', {
        course: 'admin-os',
      })
      .expect(400);
    // an id postgres can't look up: refused, not a 500
    await admin
      .delete(`/api/portal-courses/${PORTAL}/a%00b/course`)
      .expect(400);
  });

  describe('reads', () => {
    let courseId: string;

    beforeAll(async () => {
      courseId = (
        await admin
          .post('/api/courses', { slug: 'admin-nets', name: 'Mreže' })
          .expect(201)
      ).body.id;
      for (const [portal, externalId, year] of [
        [OPEN, 'open-1', 2026],
        [OWN, 'own-1', null],
      ])
        await admin
          .put(`/api/portal-courses/${portal}/${externalId}/course`, {
            course: 'admin-nets',
            year,
          })
          .expect(204);
      await admin
        .put(
          `/api/users/${await userId('student@admin.test')}/courses/${courseId}`,
          {},
        )
        .expect(204);
    });

    it('lists hub courses with their links and readers, to admins only', async () => {
      for (const path of [
        '/api/admin/courses',
        '/api/admin/portal-courses',
        `/api/admin/courses/${courseId}/readers`,
      ])
        await student.get(path).expect(403);
      await http().get('/api/admin/courses').expect(401);

      const { body } = await admin.get('/api/admin/courses').expect(200);
      expect(body).toContainEqual({
        id: courseId,
        slug: 'admin-nets',
        name: 'Mreže',
        readers: 1,
        links: [
          {
            portal: OPEN,
            label: 'Course catalog',
            mode: 'public',
            instance: null,
            externalId: 'open-1',
            year: 2026,
            unlinkable: true,
            name: 'Kriptografija admina',
          },
          {
            portal: OWN,
            label: OWN,
            mode: 'token',
            instance: null,
            externalId: 'own-1',
            year: null,
            unlinkable: true,
            name: null,
          },
        ],
      });
    });

    it("lists shared and public portal courses to link, by name, and none of a token portal's", async () => {
      const { body } = await admin
        .get('/api/admin/portal-courses?q=KRIPTOGRAFIJA%20admina')
        .expect(200);
      expect(body).toEqual({
        total: 1,
        portalCourses: [
          {
            portal: OPEN,
            label: 'Course catalog',
            mode: 'public',
            externalId: 'open-1',
            name: 'Kriptografija admina',
            course: { id: courseId, slug: 'admin-nets', name: 'Mreže' },
          },
        ],
      });
      const every = await admin
        .get('/api/admin/portal-courses?limit=200')
        .expect(200);
      expect(
        every.body.portalCourses.map((p: { portal: string }) => p.portal),
      ).not.toContain(OWN);
      await admin.get('/api/admin/portal-courses?limit=0').expect(400);
    });

    it("lists a course's readers, and no course's", async () => {
      const { body } = await admin
        .get(`/api/admin/courses/${courseId}/readers`)
        .expect(200);
      expect(body).toEqual([
        {
          userId: await userId('student@admin.test'),
          name: 'Student',
          email: 'student@admin.test',
          banned: false,
        },
      ]);
      await ban('student@admin.test');
      const banned = await admin
        .get(`/api/admin/courses/${courseId}/readers`)
        .expect(200);
      expect(banned.body[0].banned).toBe(true);
      await admin.get('/api/admin/courses/nope/readers').expect(404);
    });
  });
});
