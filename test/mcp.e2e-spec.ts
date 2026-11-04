import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { HubIngest } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts } from './accounts.js';

const PORTAL = 'mcp-test';

describe('MCP', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signUp } = accounts(() => app, mails);
  let key: string;
  let cookie: string;
  let fileId: string;

  // one JSON-RPC call to /api/mcp, the way an MCP client makes it
  let id = 0;
  const rpc = (
    method: string,
    params: object,
    auth: Record<string, string> = { 'x-api-key': key },
  ) =>
    http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set(auth)
      .send({ jsonrpc: '2.0', id: ++id, method, params });
  const call = async (name: string, args: object = {}) => {
    const res = await rpc('tools/call', { name, arguments: args }).expect(200);
    return res.body.result as {
      isError?: boolean;
      content: { text: string }[];
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) })
      .compile();
    app = moduleRef.createNestApplication(appOptions);
    await configureApp(app);
    await app.init();
    const prisma = app.get(PrismaService);
    const commands = app.get(CommandBus);

    const ingest = app.get(HubIngest).forPortal(PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Algorithms 2026' });
    await ingest.item({
      externalId: 'p1',
      course: 'c1',
      kind: 'announcement',
      title: 'Exam on Friday',
      raw: { body: 'Bring a pen' },
    });
    await ingest.file({ externalId: 'f1', course: 'c1', name: 'sorting.pdf' });
    const { hash } = await ingest.content(
      'f1',
      Readable.from([Buffer.from('%PDF sorting')]),
    );
    await prisma.representation.create({
      data: {
        hash,
        processor: 'office-text',
        version: 1,
        parts: ['quicksort', 'mergesort'],
      },
    });
    fileId = (
      await prisma.file.findUniqueOrThrow({
        where: { portal_externalId: { portal: PORTAL, externalId: 'f1' } },
      })
    ).id;
    await commands.execute(new CreateCourseCommand('alg', 'Algoritmi'));
    await commands.execute(
      new LinkPortalCourseCommand('alg', PORTAL, 'c1', 2026),
    );

    cookie = await signUp('agent@mcp.test');
    const { id: userId } = await prisma.user.findUniqueOrThrow({
      where: { email: 'agent@mcp.test' },
    });
    await commands.execute(new GrantCourseAccessCommand(userId, 'alg'));
    key = (
      await post('/api-key/create', { name: 'claude' }, cookie).expect(200)
    ).body.key;
  });

  afterAll(() => app.close());

  it('needs an API key, a session is not enough', async () => {
    await rpc('tools/list', {}, {}).expect(401);
    await rpc('tools/list', {}, { 'x-api-key': 'not-a-key' }).expect(401);
    // the route exists only behind the guards, under /api
    await http().post('/mcp').expect(404);
    await rpc('tools/list', {}, { cookie }).expect(401);
    // the key as a bearer token works too, the way MCP clients send it
    await rpc('tools/list', {}, { authorization: `Bearer ${key}` }).expect(200);
  });

  it('turns away a body that is not JSON before anything reads it', async () => {
    // the transport would read it whole, without a limit, and only then
    // answer 415; here not even the key gets looked up
    for (const auth of [{ 'x-api-key': key }, {}])
      await http()
        .post('/api/mcp')
        .set(auth)
        .set('content-type', 'text/plain')
        .send('x'.repeat(10_000))
        .expect(415);
  });

  it('takes one JSON-RPC message per request, no batches', async () => {
    // a batch would pass as one call against the limit
    const message = { jsonrpc: '2.0', method: 'tools/list', params: {} };
    await http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('x-api-key', key)
      .send([
        { ...message, id: ++id },
        { ...message, id: ++id },
      ])
      .expect(400);
  });

  it('lists its tools', async () => {
    const res = await rpc('tools/list', {}).expect(200);
    expect(
      res.body.result.tools.map((t: { name: string }) => t.name).sort(),
    ).toEqual(['list_courses', 'list_files', 'list_items', 'read_file']);
    // per user and minute
    expect(res.headers['x-ratelimit-limit-mcp']).toBe('600');
  });

  it("reads the user's courses, posts and files", async () => {
    const courses = await call('list_courses');
    expect(JSON.parse(courses.content[0].text)).toEqual([
      expect.objectContaining({ slug: 'alg', name: 'Algoritmi' }),
    ]);

    const items = await call('list_items', { course: 'alg' });
    expect(JSON.parse(items.content[0].text)).toEqual([
      expect.objectContaining({
        title: 'Exam on Friday',
        raw: { body: 'Bring a pen' },
      }),
    ]);

    const files = await call('list_files', { course: 'alg' });
    expect(JSON.parse(files.content[0].text)).toEqual([
      expect.objectContaining({ id: fileId, name: 'sorting.pdf' }),
    ]);

    const page = await call('read_file', { file: fileId, page: 2 });
    expect(page.content[0].text).toContain('page 2 of 2');
    expect(page.content[0].text).toContain('mergesort');
  });

  it('answers with an error the model can read', async () => {
    const missing = await call('list_items', { course: 'nope' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('course not found');

    const past = await call('read_file', { file: fileId, page: 3 });
    expect(past.isError).toBe(true);
  });

  it("stops a banned user's key", async () => {
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email: 'agent@mcp.test' },
      data: { banned: true },
    });
    await rpc('tools/list', {}).expect(401);
    await prisma.user.update({
      where: { email: 'agent@mcp.test' },
      data: { banned: false },
    });
  });

  it('counts calls per user, whatever key they come with', async () => {
    const second = (
      await post('/api-key/create', { name: 'second' }, cookie).expect(200)
    ).body.key;
    const left = async (k: string) =>
      Number(
        (await rpc('tools/list', {}, { 'x-api-key': k }).expect(200)).headers[
          'x-ratelimit-remaining-mcp'
        ],
      );
    const first = await left(key);
    expect(await left(second)).toBe(first - 1);
  });

  it("doesn't let another user's key read the course", async () => {
    const other = await signUp('other@mcp.test');
    const otherKey = (
      await post('/api-key/create', { name: 'x' }, other).expect(200)
    ).body.key;
    const res = await rpc(
      'tools/call',
      { name: 'list_items', arguments: { course: 'alg' } },
      { 'x-api-key': otherKey },
    ).expect(200);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain('course not found');
  });
});
