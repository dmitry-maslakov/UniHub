import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import {
  CreateCourseCommand,
  UnknownCourseError,
} from '../src/catalog/contracts.js';
import {
  GrantCourseAccessCommand,
  ReadableCoursesQuery,
  RevokeCourseAccessCommand,
  UnknownUserError,
} from '../src/identity/contracts.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';

const ORIGIN = 'http://localhost:3000';

describe('identity', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object, cookie = '') =>
    http()
      .post(`/api/auth${path}`)
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send(body);
  // the link in the last mail to someone
  const linkTo = async (to: string) => {
    const mail = await vi.waitFor(() => {
      const found = mails.findLast((m) => m.to === to);
      expect(found).toBeDefined();
      return found!;
    });
    return new URL(/https?:\/\/\S+/.exec(mail.text)![0]);
  };
  const signIn = async (email: string, password: string) => {
    const res = await post('/sign-in/email', { email, password }).expect(200);
    return (res.headers['set-cookie'] as unknown as string[]).join('; ');
  };
  const signUp = async (email: string, password = 'correct horse 1') => {
    await post('/sign-up/email', { email, password, name: 'Student' }).expect(
      200,
    );
    const link = await linkTo(email);
    await http()
      .get(link.pathname + link.search)
      .expect(302);
    return signIn(email, password);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) })
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
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

  it('resets a forgotten password by mail', async () => {
    await signUp('bo@uni.test');
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

  it('gives API keys to signed-in users', async () => {
    const cookie = await signUp('di@uni.test');
    const created = await post('/api-key/create', { name: 'claude' }, cookie);
    expect(created.status).toBe(200);

    const { valid, key } = await app
      .get(AuthService)
      .api.verifyApiKey({ body: { key: created.body.key } });
    expect(valid).toBe(true);
    expect(key?.referenceId).toBe(created.body.referenceId);
  });

  it('lets a user read the courses granted to them, an admin every course', async () => {
    const commands = app.get(CommandBus);
    const queries = app.get(QueryBus);
    const prisma = app.get(PrismaService);
    await signUp('ed@uni.test');
    await signUp('fa@uni.test');
    const [ed, fa] = await Promise.all(
      ['ed@uni.test', 'fa@uni.test'].map((email) =>
        prisma.user.findUniqueOrThrow({ where: { email } }),
      ),
    );
    await prisma.user.update({ where: { id: fa.id }, data: { role: 'admin' } });
    const { id: courseId } = await commands.execute(
      new CreateCourseCommand('os', 'Operativni sistemi'),
    );

    expect(
      await commands.execute(new GrantCourseAccessCommand(ed.id, 'os')),
    ).toEqual({ changed: true });
    expect(
      await commands.execute(new GrantCourseAccessCommand(ed.id, 'os')),
    ).toEqual({ changed: false });
    expect(await queries.execute(new ReadableCoursesQuery(ed.id))).toEqual({
      all: false,
      courseIds: [courseId],
    });
    expect(await queries.execute(new ReadableCoursesQuery(fa.id))).toEqual({
      all: true,
    });

    expect(
      await commands.execute(new RevokeCourseAccessCommand(ed.id, 'os')),
    ).toEqual({ changed: true });
    expect(await queries.execute(new ReadableCoursesQuery(ed.id))).toEqual({
      all: false,
      courseIds: [],
    });

    await expect(
      commands.execute(new GrantCourseAccessCommand(ed.id, 'nope')),
    ).rejects.toThrow(UnknownCourseError);
    await expect(
      commands.execute(new GrantCourseAccessCommand('nobody', 'os')),
    ).rejects.toThrow(UnknownUserError);
  });
});
