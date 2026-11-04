import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import {
  CourseName,
  CreateCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import { ReadScopeQuery, UnknownUserError } from '../src/identity/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { accounts, ORIGIN } from './accounts.js';

describe('identity', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, linkTo, signIn, signUp } = accounts(() => app, mails);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) })
      .compile();
    app = moduleRef.createNestApplication(appOptions);
    await configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('signs up with email and password once the email is confirmed', async () => {
    await post('/sign-up/email', {
      email: 'ana@uni.test',
      password: 'correct horse 1',
      name: 'Ana',
    }).expect(200);
    await post('/sign-in/email', {
      email: 'ana@uni.test',
      password: 'correct horse 1',
    }).expect(403);

    const link = await linkTo('ana@uni.test');
    await http()
      .get(link.pathname + link.search)
      .expect(302);

    const cookie = await signIn('ana@uni.test', 'correct horse 1');
    const session = await http()
      .get('/api/auth/get-session')
      .set('cookie', cookie)
      .expect(200);
    expect(session.body.user).toMatchObject({
      email: 'ana@uni.test',
      emailVerified: true,
    });
  });

  it('resets a forgotten password by mail, signing out everywhere', async () => {
    const before = await signUp('bo@uni.test');
    const { key } = (
      await post('/api-key/create', { name: 'agent' }, before).expect(200)
    ).body as { key: string };
    await post('/request-password-reset', {
      email: 'bo@uni.test',
      redirectTo: '/reset',
    }).expect(200);

    const link = await linkTo('bo@uni.test');
    const token = link.pathname.split('/').at(-1)!;
    await post('/reset-password', {
      token,
      newPassword: 'battery staple 2',
    }).expect(200);

    await signIn('bo@uni.test', 'battery staple 2');
    const old = await http()
      .get('/api/auth/get-session')
      .set('cookie', before)
      .expect(200);
    expect(old.body).toBeNull();
    // a key made from the old session goes with it
    const { valid } = await app
      .get(AuthService)
      .api.verifyApiKey({ body: { key } });
    expect(valid).toBe(false);
  });

  it('refuses links to other sites and requests from them', async () => {
    const cookie = await signUp('ga@uni.test');
    await post('/request-password-reset', {
      email: 'ga@uni.test',
      redirectTo: 'https://evil.test/steal',
    }).expect(403);
    await http()
      .post('/api/auth/api-key/create')
      .set('origin', 'https://evil.test')
      .set('cookie', cookie)
      .send({ name: 'x' })
      .expect(403);
  });

  it('signs a new screen in by QR, approved from a signed-in phone', async () => {
    const phone = await signUp('cy@uni.test');
    const code = await post('/device/code', { client_id: 'unihub-web' }).expect(
      200,
    );
    const { device_code, user_code } = code.body as Record<string, string>;

    await http()
      .get('/api/auth/device')
      .query({ user_code })
      .set('cookie', phone)
      .expect(200);
    await post('/device/approve', { userCode: user_code }, phone).expect(200);

    const token = await post('/device/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code,
      client_id: 'unihub-web',
    }).expect(200);
    const session = await http()
      .get('/api/auth/get-session')
      .set('authorization', `Bearer ${token.body.access_token}`)
      .expect(200);
    expect(session.body.user.email).toBe('cy@uni.test');

    await post('/device/code', { client_id: 'someone-else' }).expect(400);
  });

  it('gives API keys to users just signed in', async () => {
    const cookie = await signUp('di@uni.test');
    const created = await post('/api-key/create', { name: 'claude' }, cookie);
    expect(created.status).toBe(200);

    const { valid, key } = await app
      .get(AuthService)
      .api.verifyApiKey({ body: { key: created.body.key } });
    expect(valid).toBe(true);
    expect(key?.referenceId).toBe(created.body.referenceId);

    // a session signed in two days ago is still a session, but makes no key
    const day = 24 * 60 * 60 * 1000;
    await app.get(PrismaService).session.updateMany({
      where: { userId: created.body.referenceId },
      data: { createdAt: new Date(Date.now() - 2 * day) },
    });
    await http()
      .get('/api/auth/get-session')
      .set('cookie', cookie)
      .expect(200)
      .expect((res) => expect(res.body.user.email).toBe('di@uni.test'));
    const stale = await post('/api-key/create', { name: 'later' }, cookie);
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe('SESSION_NOT_FRESH');
  });

  it("ends a user's keys when they or an admin set a new password", async () => {
    const valid = async (key: string) =>
      (await app.get(AuthService).api.verifyApiKey({ body: { key } })).valid;
    const keyOf = async (cookie: string) =>
      (await post('/api-key/create', { name: 'agent' }, cookie).expect(200))
        .body.key as string;

    const own = await signUp('dk@uni.test');
    const first = await keyOf(own);
    await post(
      '/change-password',
      { currentPassword: 'correct horse 1', newPassword: 'battery staple 2' },
      own,
    ).expect(200);
    expect(await valid(first)).toBe(false);

    const user = await signUp('dl@uni.test');
    const second = await keyOf(user);
    await signUp('dm@uni.test');
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email: 'dm@uni.test' },
      data: { role: 'admin' },
    });
    const adminCookie = await signIn('dm@uni.test', 'correct horse 1');
    const { id: userId } = await prisma.user.findUniqueOrThrow({
      where: { email: 'dl@uni.test' },
    });
    await post(
      '/admin/set-user-password',
      { userId, newPassword: 'battery staple 2' },
      adminCookie,
    ).expect(200);
    expect(await valid(second)).toBe(false);

    // a failed change leaves them alone
    const third = await keyOf(user);
    await post(
      '/change-password',
      { currentPassword: 'wrong', newPassword: 'anything else 3' },
      await signIn('dl@uni.test', 'battery staple 2'),
    ).expect(400);
    expect(await valid(third)).toBe(true);
  });

  it('gives keys that expire in 90 days, which clients cannot change', async () => {
    const cookie = await signUp('dj@uni.test');
    const created = await post('/api-key/create', { name: 'x' }, cookie).expect(
      200,
    );
    const left = new Date(created.body.expiresAt).getTime() - Date.now();
    const day = 24 * 60 * 60 * 1000;
    expect(left).toBeGreaterThan(89 * day);
    expect(left).toBeLessThanOrEqual(90 * day);

    await post(
      '/api-key/create',
      // within the plugin's own 1 to 365 days, so only the setting refuses it
      { name: 'month', expiresIn: 30 * 24 * 60 * 60 },
      cookie,
    ).expect(400);
    // null would mean "never expires"
    await post(
      '/api-key/update',
      { keyId: created.body.id, expiresIn: null },
      cookie,
    ).expect(400);
  });

  it('lets admins grant and revoke a course, by the id catalog gave it', async () => {
    const prisma = app.get(PrismaService);
    const student = await signUp('ed@uni.test');
    const admin = await signUp('fa@uni.test');
    const [ed, fa] = await Promise.all(
      ['ed@uni.test', 'fa@uni.test'].map((email) =>
        prisma.user.findUniqueOrThrow({ where: { email } }),
      ),
    );
    await prisma.user.update({ where: { id: fa.id }, data: { role: 'admin' } });
    const { id: courseId } = await app
      .get(CommandBus)
      .execute(
        new CreateCourseCommand(
          Slug.parse('os'),
          CourseName.parse('Operativni sistemi'),
        ),
      );
    const grant = `/api/users/${ed.id}/courses/${courseId}`;
    const as = (cookie: string) => ({
      put: (path: string) =>
        http().put(path).set('origin', ORIGIN).set('cookie', cookie),
      delete: (path: string) =>
        http().delete(path).set('origin', ORIGIN).set('cookie', cookie),
    });
    const reads = async (userId: string) =>
      (await app.get(QueryBus).execute(new ReadScopeQuery(userId))).allows(
        courseId,
      );

    await http().put(grant).expect(401);
    await as(student).put(grant).expect(403);
    await as(student).delete(grant).expect(403);
    expect(await reads(ed.id)).toBe(false);
    expect(await reads(fa.id)).toBe(true);

    // twice is once
    for (let i = 0; i < 2; i++) await as(admin).put(grant).expect(204);
    expect(await reads(ed.id)).toBe(true);
    expect(await prisma.courseAccess.count({ where: { userId: ed.id } })).toBe(
      1,
    );

    await prisma.user.update({ where: { id: ed.id }, data: { banned: true } });
    expect(await reads(ed.id)).toBe(false);
    await prisma.user.update({ where: { id: ed.id }, data: { banned: false } });

    for (let i = 0; i < 2; i++) await as(admin).delete(grant).expect(204);
    expect(await reads(ed.id)).toBe(false);

    await as(admin).put(`/api/users/nobody/courses/${courseId}`).expect(404);
    await as(admin).put(`/api/users/${ed.id}/courses/a%00b`).expect(400);
    await expect(
      app.get(QueryBus).execute(new ReadScopeQuery('nobody')),
    ).rejects.toThrow(UnknownUserError);
  });
});
