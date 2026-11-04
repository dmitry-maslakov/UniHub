import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { HubIngest } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts, ORIGIN } from './accounts.js';

const PORTAL = 'admin-test';

describe('course admin routes', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp } = accounts(() => app, mails);
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
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) })
      .compile();
    app = moduleRef.createNestApplication(appOptions);
    await configureApp(app);
    await app.init();

    await app
      .get(HubIngest)
      .forPortal(PORTAL)
      .course({ externalId: '1388', name: 'OS 2026/27' });
    student = as(await signUp('student@admin.test'));
    const adminCookie = await signUp('admin@admin.test');
    await app.get(PrismaService).user.update({
      where: { email: 'admin@admin.test' },
      data: { role: 'admin' },
    });
    admin = as(adminCookie);
  });

  afterAll(() => app.close());

  it('lets only admins in', async () => {
    await http().post('/api/courses').send({}).expect(401);
    await student
      .post('/api/courses', { slug: 'admin-os', name: 'Operativni sistemi' })
      .expect(403);
    await student.put(link, { course: 'admin-os', year: 2026 }).expect(403);
    await student.delete(link).expect(403);
  });

  it('makes a course, once per slug', async () => {
    const created = await admin
      .post('/api/courses', { slug: 'admin-os', name: ' Operativni sistemi ' })
      .expect(201);
    expect(created.body).toEqual({ id: expect.any(String) });

    await admin
      .post('/api/courses', { slug: 'admin-os', name: 'again' })
      .expect(409);
    for (const bad of [
      { slug: 'Not A Slug', name: 'x' },
      { slug: 'ok', name: '  ' },
      { slug: 'ok' },
    ])
      await admin.post('/api/courses', bad).expect(400);
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

  it('says what it could not find, and what it could not take', async () => {
    await admin.put(link, { course: 'nope', year: null }).expect(404);
    await admin
      .put(`/api/portal-courses/${PORTAL}/nope/course`, {
        course: 'admin-os',
        year: null,
      })
      .expect(404);
    await admin.put(link, { course: 'admin-os', year: 1800 }).expect(400);
    // no year: one that spans years
    await admin.put(link, { course: 'admin-os' }).expect(204);
    await admin.delete(link).expect(204);
    await admin
      .put('/api/portal-courses/Not_A_Portal/1388/course', {
        course: 'admin-os',
        year: null,
      })
      .expect(400);
  });

  it('describes its routes in OpenAPI', async () => {
    const doc = (await http().get('/api/docs-json').expect(200)).body;
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/courses',
        '/api/portal-courses/{portal}/{externalId}/course',
      ]),
    );
    expect(
      doc.paths['/api/courses'].post.requestBody.content['application/json']
        .schema,
    ).toMatchObject({ properties: { slug: {}, name: {} } });
  });
});
