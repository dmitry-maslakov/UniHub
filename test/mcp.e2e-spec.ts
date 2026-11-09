import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { NO_INSTANCE, PluginName, PortalId } from '@app/kernel';
import {
  AcademicYear,
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { UnpackingRepository } from '../src/processing/domain/unpacking.js';
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';
import { processorsOn } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// Each tool once, behind the API key, the request checks and the limit.
// What a request may hold is checked on its values' specs and on
// McpRequestMiddleware, who reads what on fakes (CourseReader); a tool
// declares which schema it takes, so one bad call each shows it is there.

const PORTAL = 'mcp-test';

describe('MCP', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signUp, userId, ban } = accounts(() => app, mails);
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
    app = await bootApp({
      mails,
      imports: [processorsOn('office-text', 'ocr')],
    });
    const prisma = app.get(PrismaService);
    const commands = app.get(CommandBus);

    const ingest = portalIngest(app, PORTAL);
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
    // read off a picture on the second page, which the pdf has no text of
    await prisma.representation.create({
      data: {
        hash,
        processor: 'ocr',
        version: 1,
        parts: ['', 'merge sort, read off the slide picture'],
      },
    });
    // as if it held an archive too, a member of it with a text
    const notes = sha256('heapsort');
    const blank = sha256('a picture with no text');
    const scan = sha256('a scan');
    await app.get(UnpackingRepository).save({
      hash,
      unpacker: PluginName.parse('archives'),
      version: 1,
      policy: 1,
      members: [
        {
          path: 'docs/notes.md',
          hash: notes,
          size: 8,
          mime: null,
          leftOut: null,
        },
        // a picture that held no text: stored, so it isn't read again
        {
          path: 'docs/blank.png',
          hash: blank,
          size: 1,
          mime: null,
          leftOut: null,
        },
        // a scan read on its second page only
        {
          path: 'docs/scan.pdf',
          hash: scan,
          size: 1,
          mime: null,
          leftOut: null,
        },
        {
          path: 'video.mp4',
          hash: null,
          size: 3e9,
          mime: null,
          leftOut: 'TOO_LARGE',
        },
      ],
      cutShort: null,
    });
    // of the one processor on here
    await prisma.representation.create({
      data: {
        hash: notes,
        processor: 'office-text',
        version: 1,
        parts: ['heapsort'],
      },
    });
    await prisma.representation.create({
      data: { hash: blank, processor: 'ocr', version: 1, parts: [] },
    });
    await prisma.representation.create({
      data: {
        hash: scan,
        processor: 'ocr',
        version: 1,
        parts: ['', 'second page of a scan'],
      },
    });
    fileId = (
      await prisma.file.findUniqueOrThrow({
        where: {
          portal_instance_externalId: {
            instance: NO_INSTANCE,
            portal: PORTAL,
            externalId: 'f1',
          },
        },
      })
    ).id;
    const { id: courseId } = await commands.execute(
      new CreateCourseCommand(Slug.parse('alg'), CourseName.parse('Algoritmi')),
    );
    await commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse('alg'),
        {
          portal: PortalId.parse(PORTAL),
          instance: NO_INSTANCE,
          externalId: 'c1',
        },
        AcademicYear.parse(2026),
      ),
    );

    cookie = await signUp('agent@mcp.test');
    await commands.execute(
      new GrantCourseAccessCommand(await userId('agent@mcp.test'), courseId),
    );
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

  it('lists its tools', async () => {
    const res = await rpc('tools/list', {}).expect(200);
    expect(
      res.body.result.tools.map((t: { name: string }) => t.name).sort(),
    ).toEqual([
      'list_courses',
      'list_files',
      'list_items',
      'list_members',
      'read_file',
      'read_item',
      // search is on in the tests (search-off.e2e-spec.ts has it off)
      'search',
      'view_file',
    ]);
    // per user and minute
    expect(res.headers['x-ratelimit-limit-mcp']).toBe('600');
  });

  it("reads the user's courses, posts and files", async () => {
    const courses = await call('list_courses');
    expect(JSON.parse(courses.content[0].text)).toEqual([
      expect.objectContaining({ slug: 'alg', name: 'Algoritmi' }),
    ]);

    const items = await call('list_items', { course: 'alg' });
    const listed = JSON.parse(items.content[0].text);
    expect(listed).toEqual([
      expect.objectContaining({
        title: 'Exam on Friday',
        raw: { body: 'Bring a pen' },
      }),
    ]);
    // as search answers it
    const item = await call('read_item', { item: listed[0].id });
    expect(JSON.parse(item.content[0].text)).toEqual(listed[0]);

    const files = await call('list_files', { course: 'alg' });
    expect(JSON.parse(files.content[0].text)).toEqual([
      expect.objectContaining({ id: fileId, name: 'sorting.pdf' }),
    ]);

    // every text of the page, under its name, the longest first; one with
    // nothing in it has no heading
    const page = await call('read_file', { file: fileId, page: 2 });
    expect(page.content[0].text).toBe(
      'page 2 of 2\n\n--- ocr v1 ---\nmerge sort, read off the slide picture\n\n--- office-text v1 ---\nmergesort',
    );
    const first = await call('read_file', { file: fileId, page: 1 });
    expect(first.content[0].text).toBe(
      'page 1 of 2\n\n--- office-text v1 ---\nquicksort',
    );
    // a page of the text named, as a search result names it, and none of a
    // processor that's off and made no text of the file
    const named = await call('read_file', {
      file: fileId,
      page: 1,
      processor: 'office-text',
    });
    expect(named.content[0].text).toBe(
      'page 1 of 2 (office-text v1)\n\nquicksort',
    );
    const none = await call('read_file', {
      file: fileId,
      page: 1,
      processor: 'plain-text',
    });
    expect(none.isError).toBe(true);
    expect(none.content[0].text).toContain('page not found');

    const members = await call('list_members', { file: fileId });
    expect(JSON.parse(members.content[0].text)).toEqual([
      expect.objectContaining({ path: 'docs/notes.md' }),
      // its picture's empty text isn't one
      expect.objectContaining({ path: 'docs/blank.png', texts: [] }),
      expect.objectContaining({ path: 'docs/scan.pdf' }),
      expect.objectContaining({ path: 'video.mp4', leftOut: 'TOO_LARGE' }),
    ]);
    const member = await call('read_file', {
      file: fileId,
      member: 'docs/notes.md',
    });
    expect(member.content[0].text).toContain('heapsort');
    // no text on the page but an empty one: said so, and where to look
    const empty = await call('read_file', {
      file: fileId,
      member: 'docs/scan.pdf',
    });
    expect(empty.content[0].text).toBe(
      'page 1 of 2\n\n(no text on this page: view_file shows it)',
    );
    // a picture with no text at all has no page
    const blank = await call('read_file', {
      file: fileId,
      member: 'docs/blank.png',
    });
    expect(blank.isError).toBe(true);
    expect(blank.content[0].text).toContain('page not found');
    // listed, not kept
    const large = await call('read_file', {
      file: fileId,
      member: 'video.mp4',
    });
    expect(large.isError).toBe(true);
    expect(large.content[0].text).toContain('member not found');
  });

  it('says why a user reads no course, and where to connect a source', async () => {
    const none = await signUp('none@mcp.test');
    const theirs = (
      await post('/api-key/create', { name: 'claude' }, none).expect(200)
    ).body.key;
    const res = await rpc(
      'tools/call',
      { name: 'list_courses', arguments: {} },
      { 'x-api-key': theirs },
    ).expect(200);
    const [list, note] = res.body.result.content as { text: string }[];
    expect(JSON.parse(list.text)).toEqual([]);
    expect(note.text).toBe(
      `No courses: the user hasn't connected a source yet. They can at ${ORIGIN}/sources.`,
    );
    // one who reads a course gets the list alone
    expect((await call('list_courses')).content).toHaveLength(1);
  });

  it('answers with an error the model can read', async () => {
    const missing = await call('list_items', { course: 'nope' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('course not found');

    // a tool's parameters are checked by its schema
    for (const [tool, args] of [
      ['list_items', { course: 'alg', limit: 500 }],
      ['list_files', { course: 'Not A Slug' }],
      ['list_members', { file: fileId, limit: 500 }],
      ['read_item', { item: 'not-an-id' }],
      // past what postgres takes
      ['read_file', { file: fileId, page: 1e12 }],
    ] as const) {
      const invalid = await call(tool, args);
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0].text).toContain('Invalid parameters');
    }
  });

  it("stops a banned user's key", async () => {
    await ban('agent@mcp.test');
    await rpc('tools/list', {}).expect(401);
    await ban('agent@mcp.test', false);
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
});
