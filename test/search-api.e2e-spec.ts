import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName, PortalId } from '@app/kernel';
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
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { keyId } from '../src/processing/domain/representation.js';
import { indexName } from '../src/processing/infrastructure/search/text-index.mapping.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { testEnv } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';

// Search as users get it, GET /api/search and the MCP tool search, on
// OpenSearch. Which courses and files CourseSearch looks through is checked
// on fakes (course-search.spec.ts), what the index answers on its own
// (search.e2e-spec.ts). Here, what only the whole app shows: a file of a
// course the user doesn't read never comes back however well it matches,
// nor a removed one; a file comes once however many of its pages match; the
// limit is one count for REST and MCP. Each search counts against it, so
// each case has a user of its own.

const PORTAL = 'search-api-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX);
const fakeText = PluginName.parse('fake-text');

interface Result {
  fileId: string;
  course: string;
  pages: { page: number }[];
  sameContentIn: string[];
}

describe('search API', { timeout: 60_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signUp, userId } = accounts(() => app, mails);
  let hub: PortalIngest;
  let opensearch: Client;
  const files: Record<string, string> = {};
  const courses: Record<string, string> = {};

  const search = (cookie: string, query: Record<string, string | number>) =>
    http().get('/api/search').query(query).set('cookie', cookie);
  const found = async (cookie: string, q: string, limit = 10) =>
    (await search(cookie, { q, limit }).expect(200)).body.results as Result[];
  const tool = (key: string, args: object) =>
    http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('x-api-key', key)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'search', arguments: args },
      })
      .expect(200)
      .then(
        (res) =>
          res.body.result as { isError?: boolean; content: { text: string }[] },
      );

  // a file of a portal course, there once its text is in the index in whole
  // (its manifest) and searchable
  const upload = async (externalId: string, course: string, text: string) => {
    await hub.file({ externalId, course, name: `${externalId}.txt` });
    const { hash } = await hub.content(externalId, Readable.from([text]));
    const id = keyId({ hash, processor: fakeText, version: 1 });
    await vi.waitFor(
      async () =>
        expect((await opensearch.exists({ index, id })).body).toBe(true),
      { timeout: 20_000, interval: 200 },
    );
    files[externalId] = (
      await app.get(PrismaService).file.findUniqueOrThrow({
        where: { portal_externalId: { portal: PORTAL, externalId } },
      })
    ).id;
  };
  // a user who reads these courses, signed in
  const reader = async (name: string, ...slugs: string[]) => {
    const cookie = await signUp(`${name}@search.test`);
    for (const slug of slugs) await grant(name, slug);
    return cookie;
  };
  const grant = async (name: string, slug: string) =>
    app
      .get(CommandBus)
      .execute(
        new GrantCourseAccessCommand(
          await userId(`${name}@search.test`),
          courses[slug],
        ),
      );
  const keyOf = async (cookie: string) =>
    (await post('/api-key/create', { name: 'agent' }, cookie).expect(200)).body
      .key as string;

  beforeAll(async () => {
    app = await bootApp({ mails, imports: [FakePluginsModule] });
    hub = portalIngest(app, PORTAL);
    opensearch = app.get(OPENSEARCH);
    const commands = app.get(CommandBus);
    for (const slug of ['ours', 'theirs']) {
      await hub.course({ externalId: slug, name: slug });
      ({ id: courses[slug] } = await commands.execute(
        new CreateCourseCommand(Slug.parse(slug), CourseName.parse(slug)),
      ));
      await commands.execute(
        new LinkPortalCourseCommand(
          Slug.parse(slug),
          { portal: PortalId.parse(PORTAL), externalId: slug },
          AcademicYear.parse(2026),
        ),
      );
    }

    // the query itself, word for word, in a course most users don't read
    await upload('secret', 'theirs', 'semafor tajna lozinka');
    await upload('os', 'ours', 'semafor u operativnim sistemima');
    await upload('shared-os', 'theirs', 'semafor u operativnim sistemima');
    await upload('networks', 'ours', 'potpuno drugi tekst o mrežama');
    await upload('exam', 'ours', 'raspored ispita jun');
    await upload('lectures', 'ours', 'raspored predavanja');
    // fake-text makes a page of each part between form feeds
    const book = Array.from(
      { length: 12 },
      (_, i) => `protokol i opet protokol, strana ${i + 1}`,
    );
    await upload('book', 'ours', book.join('\f'));
    for (const n of [1, 2, 3])
      await upload(`sheet-${n}`, 'ours', `protokol, list ${n}`);
  });

  afterAll(() => app.close());

  it("finds nothing of a course the user doesn't read, however well it matches", async () => {
    const student = await reader('acl', 'ours');

    const results = await found(student, 'semafor tajna lozinka');

    expect(results.map((r) => r.fileId)).toEqual([files.os]);
    // its copy in the other course isn't named either
    expect(results[0]).toMatchObject({ course: 'ours', sameContentIn: [] });

    // the next search counts the grant
    await grant('acl', 'theirs');
    const granted = await found(student, 'semafor tajna lozinka');
    expect(granted[0]).toMatchObject({ fileId: files.secret });
    expect(granted.find((r) => r.fileId === files.os)).toMatchObject({
      sameContentIn: [files['shared-os']],
    });
  });

  it('finds nothing of a removed file from then on', async () => {
    const student = await reader('removed', 'ours');
    const ids = async () =>
      (await found(student, 'raspored ispita jun')).map((r) => r.fileId);
    expect(await ids()).toEqual([files.exam, files.lectures]);

    await hub.removeFile('exam');

    expect(await ids()).toEqual([files.lectures]);
  });

  it('answers a file once however many of its pages match, with its best three', async () => {
    const student = await reader('collapse', 'ours');

    const results = await found(student, 'protokol', 3);

    expect(results.map((r) => r.fileId)).toHaveLength(3);
    expect(new Set(results.map((r) => r.fileId)).size).toBe(3);
    expect(results[0]).toMatchObject({ fileId: files.book });
    expect(results[0].pages).toHaveLength(3);
  });

  it('answers the route and the tool alike, and checks what each is asked', async () => {
    const student = await reader('both', 'ours');
    const key = await keyOf(student);

    const rest = await found(student, 'mrežama');
    const mcp = await tool(key, { q: 'mrežama' });
    expect(rest.map((r) => r.fileId)).toEqual([files.networks]);
    expect(JSON.parse(mcp.content[0].text)).toEqual({ results: rest });

    await search(student, { q: 'a' }).expect(400);
    expect((await tool(key, { q: 'a' })).content[0].text).toContain(
      'Invalid parameters',
    );
    await search(student, { q: 'semafor', course: 'theirs' }).expect(404);
    expect(
      (await tool(key, { q: 'semafor', course: 'theirs' })).content[0].text,
    ).toContain('course not found');
  });

  it('counts calls per user, REST and MCP together, 20 a minute', async () => {
    // no course: nothing to look through, but every call counts
    const student = await reader('limit');
    const key = await keyOf(student);

    const first = await search(student, { q: 'semafor' }).expect(200);
    expect(first.headers['x-ratelimit-limit-search']).toBe('20');
    for (let i = 0; i < 18; i++)
      await search(student, { q: 'semafor' }).expect(200);
    expect((await tool(key, { q: 'semafor' })).isError).toBeUndefined();

    const over = await tool(key, { q: 'semafor' });
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toContain('Too Many Requests');
    await search(student, { q: 'semafor' }).expect(429);
  });
});
