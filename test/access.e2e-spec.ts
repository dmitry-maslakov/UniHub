import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AppModule } from '../src/app.module.js';
import { appOptions, configureApp } from '../src/app.setup.js';
import { PortalId } from '@app/kernel';
import {
  AcademicYear,
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts } from './accounts.js';
import { portalIngest } from './ingest.js';

const PORTAL = 'rest-test';
const sha256 = (data: Buffer) =>
  createHash('sha256').update(data).digest('hex');

describe('REST API', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp } = accounts(() => app, mails);
  const get = (path: string, cookie: string) =>
    http().get(path).set('cookie', cookie);
  const download = (path: string, cookie: string) =>
    get(path, cookie)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  let student: string;
  let stranger: string;
  let admin: string;
  const ids: Record<string, string> = {};
  const slides = Buffer.from('%PDF slides about processes');

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

    // c1 is the student's course, c2 someone else's
    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'OS 2026' });
    await ingest.course({ externalId: 'c2', name: 'Networks' });
    for (const [id, day] of [
      ['old', '2026-10-01'],
      ['new', '2026-10-20'],
      ['gone', '2026-10-25'],
    ])
      await ingest.item({
        externalId: id,
        course: 'c1',
        kind: 'announcement',
        title: `post ${id}`,
        publishedAt: new Date(day),
        raw: { body: `text of ${id}` },
      });
    await ingest.removeItem('gone');
    await ingest.item({
      externalId: 'gone-later',
      course: 'c1',
      kind: 'announcement',
      title: 'exam solutions (too early)',
      raw: {},
    });

    const files: [string, object, Buffer | null][] = [
      [
        'slides',
        {
          course: 'c1',
          name: 'Predavanje 1 — procesi.pdf',
          path: 'lectures',
          mime: 'application/pdf',
        },
        slides,
      ],
      // with a post that gets removed
      [
        'solutions',
        { item: 'gone-later', name: 'solutions.pdf' },
        Buffer.from('ans'),
      ],
      // attached to a post, no course of its own
      ['homework', { item: 'new', name: 'homework.docx' }, Buffer.from('hw')],
      ['removed', { course: 'c1', name: 'old.pdf' }, Buffer.from('old')],
      // the same bytes, in a course the student wasn't given
      ['copy', { course: 'c2', name: 'copy.pdf' }, slides],
      ['no-content', { course: 'c1', name: 'notes.pdf' }, null],
      [
        'odd',
        {
          course: 'c1',
          name: "O'Brien (1).pdf",
          mime: 'application/pdf — scan',
        },
        Buffer.from('odd'),
      ],
    ];
    for (const [externalId, record, content] of files) {
      await ingest.file({ externalId, ...record } as never);
      if (content) await ingest.content(externalId, Readable.from([content]));
      ids[externalId] = (
        await prisma.file.findUniqueOrThrow({
          where: { portal_externalId: { portal: PORTAL, externalId } },
        })
      ).id;
    }
    await ingest.removeFile('removed');
    await ingest.removeItem('gone-later');

    // two versions of one processor's text and another processor's
    for (const [processor, version, parts] of [
      ['office-text', 1, ['page one', 'page two']],
      ['office-text', 2, ['v2 one', 'v2 two', 'v2 three']],
      ['zz-ocr', 1, ['ocr text']],
    ] as const)
      await prisma.representation.create({
        data: { hash: sha256(slides), processor, version, parts: [...parts] },
      });

    const courseIds: Record<string, string> = {};
    for (const [slug, name, externalId] of [
      ['sys', 'Operativni sistemi', 'c1'],
      ['net', 'Mreže', 'c2'],
    ]) {
      ({ id: courseIds[slug] } = await commands.execute(
        new CreateCourseCommand(Slug.parse(slug), CourseName.parse(name)),
      ));
      await commands.execute(
        new LinkPortalCourseCommand(
          Slug.parse(slug),
          { portal: PortalId.parse(PORTAL), externalId },
          AcademicYear.parse(2026),
        ),
      );
    }

    student = await signUp('student@rest.test');
    stranger = await signUp('stranger@rest.test');
    admin = await signUp('admin@rest.test');
    const user = (email: string) =>
      prisma.user.findUniqueOrThrow({ where: { email } });
    await commands.execute(
      new GrantCourseAccessCommand(
        (await user('student@rest.test')).id,
        courseIds.sys,
      ),
    );
    await prisma.user.update({
      where: { email: 'admin@rest.test' },
      data: { role: 'admin' },
    });
  });

  afterAll(() => app.close());

  it('needs a signed-in user', async () => {
    await http().get('/api/courses').expect(401);
  });

  it("lists a student's courses and what's in them", async () => {
    const courses = await get('/api/courses', student).expect(200);
    // per signed-in user and minute
    expect(courses.headers['x-ratelimit-limit-api']).toBe('1200');
    expect(courses.body).toEqual([
      {
        slug: 'sys',
        name: 'Operativni sistemi',
        portalCourses: [{ portal: PORTAL, name: 'OS 2026', year: 2026 }],
      },
    ]);

    const items = await get('/api/courses/sys/items', student).expect(200);
    expect(items.body.map((i: { title: string }) => i.title)).toEqual([
      'post new',
      'post old',
    ]);
    expect(items.body[0].raw).toEqual({ body: 'text of new' });

    const files = await get('/api/courses/sys/files', student).expect(200);
    const byName = Object.fromEntries(
      files.body.map((f: { name: string }) => [f.name, f]),
    );
    expect(Object.keys(byName).sort()).toEqual(
      [
        "O'Brien (1).pdf",
        'Predavanje 1 — procesi.pdf',
        'homework.docx',
        'notes.pdf',
      ].sort(),
    );
    expect(byName['homework.docx'].itemId).toBe(items.body[0].id);
    expect(byName['notes.pdf'].hasContent).toBe(false);
  });

  it('pages lists within bounds', async () => {
    const second = await get(
      '/api/courses/sys/items?offset=1&limit=1',
      student,
    ).expect(200);
    expect(second.body.map((i: { title: string }) => i.title)).toEqual([
      'post old',
    ]);
    for (const query of [
      'limit=500',
      'limit=0',
      'offset=-1',
      'offset=1.5',
      'offset=99999999999999999999',
      'limit=1&limit=2',
    ])
      await get(`/api/courses/sys/items?${query}`, student).expect(400);
  });

  it('reads a file as text page by page', async () => {
    const file = await get(`/api/files/${ids.slides}`, student).expect(200);
    expect(file.body.texts).toEqual([
      { processor: 'office-text', version: 2, pages: 3 },
      { processor: 'zz-ocr', version: 1, pages: 1 },
    ]);

    const page = await get(
      `/api/files/${ids.slides}/text?page=2`,
      student,
    ).expect(200);
    expect(page.body).toEqual({
      processor: 'office-text',
      version: 2,
      page: 2,
      pages: 3,
      text: 'v2 two',
    });
    const ocr = await get(
      `/api/files/${ids.slides}/text?processor=zz-ocr`,
      student,
    ).expect(200);
    expect(ocr.body.text).toBe('ocr text');

    await get(`/api/files/${ids.slides}/text?page=4`, student).expect(404);
    await get(`/api/files/${ids.slides}/text?page=0`, student).expect(400);
    for (const query of [
      'page=99999999999',
      'processor=a&processor=b',
      'processor=Not%20One',
    ])
      await get(`/api/files/${ids.slides}/text?${query}`, student).expect(400);
    await get(`/api/files/${ids['no-content']}/text`, student).expect(404);
  });

  it('downloads a file', async () => {
    const content = await download(
      `/api/files/${ids.slides}/content`,
      student,
    ).expect(200);
    expect(sha256(content.body)).toBe(sha256(slides));
    expect(content.headers['content-type']).toBe('application/pdf');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Predavanje 1 — procesi.pdf')}`,
    );

    // a mime type no header can carry is sent as plain bytes
    const odd = await download(`/api/files/${ids.odd}/content`, student).expect(
      200,
    );
    expect(odd.headers['content-type']).toBe('application/octet-stream');
    expect(odd.headers['content-disposition']).toMatch(/^attachment; /);

    await get(`/api/files/${ids['no-content']}/content`, student).expect(404);
  });

  it("shows nothing of courses the user wasn't given", async () => {
    expect((await get('/api/courses', stranger).expect(200)).body).toEqual([]);
    await get('/api/courses/sys/items', stranger).expect(404);
    await get('/api/courses/sys/files', stranger).expect(404);
    for (const path of ['', '/text', '/content'])
      await get(`/api/files/${ids.slides}${path}`, stranger).expect(404);

    // the same bytes in another course don't open that course's file
    await get(`/api/files/${ids.copy}`, student).expect(404);
    await get(`/api/files/${ids.copy}/content`, student).expect(404);
    // removed, or not there at all: the same answer
    await get(`/api/files/${ids.removed}`, student).expect(404);
    // and an attachment goes with its post
    await get(`/api/files/${ids.solutions}`, student).expect(404);
    await get(`/api/files/${ids.solutions}/content`, student).expect(404);
    await get('/api/courses/nope/items', student).expect(404);
  });

  it('lets an admin read every course', async () => {
    const courses = await get('/api/courses', admin).expect(200);
    expect(courses.body.map((c: { slug: string }) => c.slug)).toEqual(
      expect.arrayContaining(['sys', 'net']),
    );
    await get(`/api/files/${ids.copy}`, admin).expect(200);
  });

  it('describes itself in OpenAPI, for anyone', async () => {
    const doc = (await http().get('/api/docs-json').expect(200)).body;
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/courses',
        '/api/courses/{slug}/items',
        '/api/files/{id}/text',
        '/api/files/{id}/content',
      ]),
    );
    // the page's bounds as the schema has them
    expect(doc.paths['/api/courses/{slug}/items'].get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ maximum: 200, default: 50 }),
        }),
      ]),
    );
  });
});
