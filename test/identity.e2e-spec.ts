import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  CourseName,
  CreateCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import {
  GrantCourseAccessCommand,
  ReadScopeQuery,
  RevokeCourseAccessCommand,
  UnknownUserError,
} from '../src/identity/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';

describe('identity', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, linkTo, signIn, signUp } = accounts(() => app, mails);
  // as an app without cookies does: the session token in Authorization
  const postWithToken = (path: string, body: object, token: string) =>
    http()
      .post(`/api/auth${path}`)
      .set('origin', ORIGIN)
      .set('authorization', `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    app = await bootApp({ mails });
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
    // a screen signed in just now makes a key for its MCP client
    await postWithToken(
      '/api-key/create',
      { name: 'screen' },
      token.body.access_token,
    ).expect(200);

    await post('/device/code', { client_id: 'someone-else' }).expect(400);
  });

  it('gives API keys to users just signed in, by cookie or token', async () => {
    const cookie = await signUp('di@uni.test');
    const { headers } = await post('/sign-in/email', {
      email: 'di@uni.test',
      password: 'correct horse 1',
    }).expect(200);
    const token = headers['set-auth-token'] as string;
    const created = await post('/api-key/create', { name: 'claude' }, cookie);
    expect(created.status).toBe(200);
    await postWithToken('/api-key/create', { name: 'cli' }, token).expect(200);

    const { valid, key } = await app
      .get(AuthService)
      .api.verifyApiKey({ body: { key: created.body.key } });
    expect(valid).toBe(true);
    expect(key?.referenceId).toBe(created.body.referenceId);

    // sessions signed in two days ago are still sessions, but make no key
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
    for (const stale of [
      await post('/api-key/create', { name: 'later' }, cookie),
      await postWithToken('/api-key/create', { name: 'later' }, token),
    ]) {
      expect(stale.status).toBe(403);
      expect(stale.body.code).toBe('SESSION_NOT_FRESH');
    }

    // nor approve a screen's sign-in, which would give it a fresh session
    const { user_code } = (
      await post('/device/code', { client_id: 'unihub-web' }).expect(200)
    ).body as Record<string, string>;
    await http()
      .get('/api/auth/device')
      .query({ user_code })
      .set('cookie', cookie)
      .expect(200);
    const approve = await post(
      '/device/approve',
      { userCode: user_code },
      cookie,
    );
    expect(approve.status).toBe(403);
    expect(approve.body.code).toBe('SESSION_NOT_FRESH');
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

  // the admin route that sends these is access's (access.e2e-spec)
  it('grants and revokes a course by the id catalog gave it', async () => {
    const prisma = app.get(PrismaService);
    const commands = app.get(CommandBus);
    await signUp('ed@uni.test');
    const ed = await prisma.user.findUniqueOrThrow({
      where: { email: 'ed@uni.test' },
    });
    const { id: courseId } = await commands.execute(
      new CreateCourseCommand(
        Slug.parse('os'),
        CourseName.parse('Operativni sistemi'),
      ),
    );
    const reads = async (userId: string) =>
      (await app.get(QueryBus).execute(new ReadScopeQuery(userId))).allows(
        courseId,
      );
    expect(await reads(ed.id)).toBe(false);

    // twice is once
    for (const changed of [true, false])
      expect(
        await commands.execute(new GrantCourseAccessCommand(ed.id, courseId)),
      ).toEqual({ changed });
    expect(await reads(ed.id)).toBe(true);
    expect(await prisma.courseAccess.count({ where: { userId: ed.id } })).toBe(
      1,
    );

    await prisma.user.update({ where: { id: ed.id }, data: { banned: true } });
    expect(await reads(ed.id)).toBe(false);
    await prisma.user.update({ where: { id: ed.id }, data: { banned: false } });

    for (const changed of [true, false])
      expect(
        await commands.execute(new RevokeCourseAccessCommand(ed.id, courseId)),
      ).toEqual({ changed });
    expect(await reads(ed.id)).toBe(false);

    await expect(
      commands.execute(new GrantCourseAccessCommand('nobody', courseId)),
    ).rejects.toThrow(UnknownUserError);
    await expect(
      app.get(QueryBus).execute(new ReadScopeQuery('nobody')),
    ).rejects.toThrow(UnknownUserError);
  });
});
