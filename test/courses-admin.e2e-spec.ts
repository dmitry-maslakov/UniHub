import type { INestApplication } from '@nestjs/common';
import type { Mail } from '../src/identity/domain/mailer.js';
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';
import { portalIngest } from './ingest.js';

// Each admin route once, behind its role. What a request may hold is
// checked on its schema (catalog's values.spec and requests.spec), what a
// command refuses on fakes (course.handlers.spec); a route declares which
// schema it takes, so one bad request each shows it is there.

const PORTAL = 'admin-test';

describe('course admin routes', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => app, mails);
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
    app = await bootApp({ mails });

    await portalIngest(app, PORTAL).course({
      externalId: '1388',
      name: 'OS 2026/27',
    });
    student = as(await signUp('student@admin.test'));
    admin = as(await signUp('admin@admin.test'));
    await makeAdmin('admin@admin.test');
  });

  afterAll(() => app.close());

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
      portalCourses: [{ portal: PORTAL, name: 'OS 2026/27', year: 2026 }],
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
});
