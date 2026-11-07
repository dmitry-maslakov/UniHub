import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import {
  GrantCourseAccessCommand,
  ReadScopeQuery,
  RevokeCourseAccessCommand,
} from '../src/identity/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';

// Better Auth as the hub sets it up (its own cases, like a device code's
// expiry, are its tests' to check), and the course grants as postgres keeps
// them. Who reads what is checked on fakes (Reader, ReadScope, the handlers).

describe('identity', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, linkTo, signIn, signUp, userId, makeAdmin, ban } =
    accounts(() => app, mails);
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
    const { device_code, user_code, verification_uri } = code.body as Record<
      string,
      string
    >;
    // the web app's approve page
    expect(new URL(verification_uri).pathname).toBe('/device');

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

  // a screen asks for a code, a signed-in phone approves it, the screen polls
  const approvedDevice = async (clientId: string, phone: string) => {
    const code = await post('/device/code', { client_id: clientId }).expect(
      200,
    );
    const { device_code, user_code } = code.body as Record<string, string>;
    await http()
      .get('/api/auth/device')
      .query({ user_code })
      .set('cookie', phone)
      .expect(200);
    await post('/device/approve', { userCode: user_code }, phone).expect(200);
    return post('/device/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code,
      client_id: clientId,
    }).expect(200);
  };

  it('signs the web app in on the screen that asked, by a cookie, once a phone approves', async () => {
    const phone = await signUp('wa@uni.test');
    const token = await approvedDevice('unihub-web', phone);
    const cookie = (token.headers['set-cookie'] as unknown as string[]).join(
      '; ',
    );
    expect(cookie).toContain('session_token=');
    const session = await http()
      .get('/api/auth/get-session')
      .set('cookie', cookie)
      .expect(200);
    expect(session.body.user.email).toBe('wa@uni.test');
  });

  it("gives the hub's app a token and no cookie", async () => {
    const phone = await signUp('na@uni.test');
    const token = await approvedDevice('unihub-app', phone);
    expect(token.headers['set-cookie']).toBeUndefined();
    expect(token.body.access_token).toEqual(expect.any(String));
  });

  it('lets users delete their own account with their password, and drops their keys', async () => {
    const cookie = await signUp('gone@uni.test');
    const id = await userId('gone@uni.test');
    await post('/api-key/create', { name: 'agent' }, cookie).expect(200);
    const prisma = app.get(PrismaService);
    expect(await prisma.apikey.count({ where: { referenceId: id } })).toBe(1);

    const wrong = await post('/delete-user', { password: 'not it' }, cookie);
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    await post('/delete-user', { password: 'correct horse 1' }, cookie).expect(
      200,
    );
    expect(await prisma.user.count({ where: { id } })).toBe(0);
    expect(await prisma.apikey.count({ where: { referenceId: id } })).toBe(0);
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
    await makeAdmin('dm@uni.test');
    const adminCookie = await signIn('dm@uni.test', 'correct horse 1');
    await post(
      '/admin/set-user-password',
      { userId: await userId('dl@uni.test'), newPassword: 'battery staple 2' },
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

  it('says whether Google sign-in is on, to anyone', async () => {
    await http()
      .get('/api/sign-in-methods')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ google: false }));
  });

  it("takes only JSON on the hub's routes, which no form elsewhere can send", async () => {
    await signUp('fa@uni.test');
    await makeAdmin('fa@uni.test');
    const cookie = await signIn('fa@uni.test', 'correct horse 1');
    const create = () =>
      http().post('/api/courses').set('origin', ORIGIN).set('cookie', cookie);

    await create().type('form').send('slug=form-os&name=OS').expect(400);
    await create().send({ slug: 'json-os', name: 'OS' }).expect(201);
  });

  // the admin route that sends these is access's (access.e2e-spec)
  it('keeps a grant once, and reads it back, but not for a banned user', async () => {
    const commands = app.get(CommandBus);
    await signUp('ed@uni.test');
    const ed = await userId('ed@uni.test');
    const course = 'a-course-id';
    const reads = async () =>
      (await app.get(QueryBus).execute(new ReadScopeQuery(ed))).allows(course);

    for (const changed of [true, false])
      expect(
        await commands.execute(new GrantCourseAccessCommand(ed, course)),
      ).toEqual({ changed });
    expect(await reads()).toBe(true);
    expect(
      await app
        .get(PrismaService)
        .courseAccess.count({ where: { userId: ed } }),
    ).toBe(1);

    await ban('ed@uni.test');
    expect(await reads()).toBe(false);
    await ban('ed@uni.test', false);

    for (const changed of [true, false])
      expect(
        await commands.execute(new RevokeCourseAccessCommand(ed, course)),
      ).toEqual({ changed });
    expect(await reads()).toBe(false);
  });
});
