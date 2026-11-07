import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { NO_INSTANCE, PortalId } from '@app/kernel';
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
import { bootApp } from './app.js';
import { accounts, ORIGIN } from './accounts.js';
import { processorsOn } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// Each REST route once, and what only the queries decide: which files a
// course shows, in what order, a page at a time. Who reads what is checked
// on fakes (CourseReader), what a request may hold on its schemas; a route
// declares which schema it takes, so one bad request each shows it is there.

const PORTAL = 'rest-test';

describe('REST API', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, userId, makeAdmin } = accounts(() => app, mails);
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
  const courseIds: Record<string, string> = {};
  const slides = Buffer.from('%PDF slides about processes');

  beforeAll(async () => {
    app = await bootApp({
      mails,
      imports: [processorsOn('office-text', 'zz-ocr')],
    });
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
        Buffer.from('%PDF answers'),
      ],
      // attached to a post, no course of its own
      [
        'homework',
        { item: 'new', name: 'homework.docx' },
        Buffer.from('PK homework'),
      ],
      ['removed', { course: 'c1', name: 'old.pdf' }, Buffer.from('%PDF old')],
      // a page that would run in the hub's own origin if a browser showed it
      [
        'page',
        { course: 'c1', name: 'page.html', mime: 'text/html' },
        Buffer.from('<script>alert(1)</script>'),
      ],
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
        Buffer.from('%PDF scan'),
      ],
    ];
    for (const [externalId, record, content] of files) {
      await ingest.file({ externalId, ...record } as never);
      if (content) await ingest.content(externalId, Readable.from([content]));
      ids[externalId] = (
        await prisma.file.findUniqueOrThrow({
          where: {
            portal_instance_externalId: {
              instance: NO_INSTANCE,
              portal: PORTAL,
              externalId,
            },
          },
        })
      ).id;
    }
    await ingest.removeFile('removed');
    await ingest.removeItem('gone-later');

    // two versions of one processor's text, another processor's, and the
    // text of one that's off, first by name
    for (const [processor, version, parts] of [
      ['office-text', 1, ['page one', 'page two']],
      ['office-text', 2, ['v2 one', 'v2 two', 'v2 three']],
      ['zz-ocr', 1, ['ocr text']],
      ['aa-off', 1, ['off one', 'off two']],
    ] as const)
      await prisma.representation.create({
        data: { hash: sha256(slides), processor, version, parts: [...parts] },
      });

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
          { portal: PortalId.parse(PORTAL), instance: NO_INSTANCE, externalId },
          AcademicYear.parse(2026),
        ),
      );
    }

    student = await signUp('student@rest.test');
    stranger = await signUp('stranger@rest.test');
    admin = await signUp('admin@rest.test');
    await commands.execute(
      new GrantCourseAccessCommand(
        await userId('student@rest.test'),
        courseIds.sys,
      ),
    );
    await makeAdmin('admin@rest.test');
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
        sources: [PORTAL],
        portalCourses: [
          {
            portal: PORTAL,
            externalId: 'c1',
            name: 'OS 2026',
            url: null,
            year: 2026,
            via: 'link',
          },
        ],
      },
    ]);

    // newest first, the removed one left out
    const items = await get('/api/courses/sys/items', student).expect(200);
    expect(items.body.map((i: { title: string }) => i.title)).toEqual([
      'post new',
      'post old',
    ]);
    expect(items.body[0].raw).toEqual({ body: 'text of new' });

    // neither a removed file nor the attachment of a removed post
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
        'page.html',
      ].sort(),
    );
    expect(byName['homework.docx'].itemId).toBe(items.body[0].id);
    expect(byName['notes.pdf'].hasContent).toBe(false);
  });

  // as search answers it
  it('opens a post, none a course does not show, nor one of a course not given', async () => {
    const [newest] = (await get('/api/courses/sys/items', student).expect(200))
      .body;
    const gone = await app.get(PrismaService).item.findUniqueOrThrow({
      where: {
        portal_instance_externalId: {
          instance: NO_INSTANCE,
          portal: PORTAL,
          externalId: 'gone',
        },
      },
    });

    expect(
      (await get(`/api/items/${newest.id}`, student).expect(200)).body,
    ).toEqual(newest);
    await get(`/api/items/${gone.id}`, student).expect(404);
    await get(`/api/items/${newest.id}`, stranger).expect(404);
    await get('/api/items/not-an-id', student).expect(400);
  });

  it("answers a post's text, as the hub reads it", async () => {
    const [newest] = (await get('/api/courses/sys/items', student).expect(200))
      .body;

    expect(
      (await get(`/api/items/${newest.id}/text`, student).expect(200)).body,
    ).toEqual({ text: 'text of new' });
    await get(`/api/items/${newest.id}/text`, stranger).expect(404);
    await get('/api/items/not-an-id/text', student).expect(400);
  });

  it('lists only the files of the post named', async () => {
    const [newest, oldest] = (
      await get('/api/courses/sys/items', student).expect(200)
    ).body;

    const attached = await get(
      `/api/courses/sys/files?item=${newest.id}`,
      student,
    ).expect(200);
    expect(attached.body.map((f: { name: string }) => f.name)).toEqual([
      'homework.docx',
    ]);
    expect(
      (
        await get(`/api/courses/sys/files?item=${oldest.id}`, student).expect(
          200,
        )
      ).body,
    ).toEqual([]);
    await get('/api/courses/sys/files?item=not-an-id', student).expect(400);
  });

  it('pages lists', async () => {
    const second = await get(
      '/api/courses/sys/items?offset=1&limit=1',
      student,
    ).expect(200);
    expect(second.body.map((i: { title: string }) => i.title)).toEqual([
      'post old',
    ]);
  });

  it('checks a request against the schema its route takes', async () => {
    for (const path of [
      '/api/courses/sys/items?limit=500',
      '/api/courses/Not%20A%20Slug/files',
      `/api/files/${ids.slides}/text?page=0`,
    ])
      await get(path, student).expect(400);
  });

  it('reads a file as text page by page', async () => {
    const file = await get(`/api/files/${ids.slides}`, student).expect(200);
    // each processor's last version, of those on
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
    // a processor turned off keeps its text, unread: neither listed above,
    // nor the first one's page, nor read by its name
    await get(`/api/files/${ids.slides}/text?processor=aa-off`, student).expect(
      404,
    );
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
  });

  it('serves a PDF inline when asked, and an HTML file never', async () => {
    const pdf = await download(
      `/api/files/${ids.slides}/content?disposition=inline`,
      student,
    ).expect(200);
    expect(pdf.headers['content-disposition']).toMatch(/^inline; /);
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');

    // asked or not, a page that runs is saved, not shown
    for (const query of ['?disposition=inline', ''])
      expect(
        (await download(`/api/files/${ids.page}/content${query}`, student))
          .headers['content-disposition'],
      ).toMatch(/^attachment; /);
    await get(
      `/api/files/${ids.slides}/content?disposition=run`,
      student,
    ).expect(400);
  });

  it('finds no file a course does not show, nor one of a course not given', async () => {
    // removed, or the attachment of a removed post
    await get(`/api/files/${ids.removed}`, student).expect(404);
    await get(`/api/files/${ids.solutions}/content`, student).expect(404);
    // the same bytes in another course don't open that course's file
    await get(`/api/files/${ids.copy}`, student).expect(404);
    expect((await get('/api/courses', stranger).expect(200)).body).toEqual([]);
    await get(`/api/files/${ids.slides}`, stranger).expect(404);
  });

  it('lets an admin read every course', async () => {
    const courses = await get('/api/courses', admin).expect(200);
    expect(courses.body.map((c: { slug: string }) => c.slug)).toEqual(
      expect.arrayContaining(['sys', 'net']),
    );
    await get(`/api/files/${ids.copy}`, admin).expect(200);
  });

  it('lets admins grant and revoke a course', async () => {
    const reader = await signUp('reader@rest.test');
    const id = await userId('reader@rest.test');
    const as = (cookie: string) => ({
      put: (path: string) =>
        http().put(path).set('origin', ORIGIN).set('cookie', cookie),
      delete: (path: string) =>
        http().delete(path).set('origin', ORIGIN).set('cookie', cookie),
    });
    const grant = `/api/users/${id}/courses/${courseIds.net}`;
    const slugs = async () =>
      (await get('/api/courses', reader).expect(200)).body.map(
        (c: { slug: string }) => c.slug,
      );

    await http().put(grant).expect(401);
    await as(student).put(grant).expect(403);

    await as(admin).put(grant).expect(204);
    expect(await slugs()).toEqual(['net']);
    await as(admin).delete(grant).expect(204);
    expect(await slugs()).toEqual([]);
    // a user Better Auth doesn't have
    await as(admin)
      .put(`/api/users/nobody/courses/${courseIds.net}`)
      .expect(404);
    // an id postgres can't look up: its schema refuses it, not a 500
    await as(admin).put(`/api/users/${id}/courses/a%00b`).expect(400);
    await as(admin)
      .delete(`/api/users/a%00b/courses/${courseIds.net}`)
      .expect(400);
  });
});
