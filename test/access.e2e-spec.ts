import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';
import {
  CreateCourseCommand,
  LinkPortalCourseCommand,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import { Mailer, type Mail } from '../src/identity/domain/mailer.js';
import { HubIngest } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { accounts } from './accounts.js';

const PORTAL = 'rest-test';

describe('REST API', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp } = accounts(() => app, mails);
  const get = (path: string, cookie: string) =>
    http().get(path).set('cookie', cookie);

  let student: string;
  let stranger: string;
  let fileId: string;
  const slides = Buffer.from('%PDF slides about processes');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Mailer)
      .useValue({ send: async (mail: Mail) => void mails.push(mail) })
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();

    // a course with two portal posts, a removed one and a file with its text
    const ingest = app.get(HubIngest).forPortal(PORTAL);
    await ingest.course({ externalId: 'c1', name: 'OS 2026' });
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
    await ingest.remove('item', 'gone');
    await ingest.file({
      externalId: 'f1',
      course: 'c1',
      name: 'Predavanje 1 — procesi.pdf',
      path: 'lectures',
    });
    const { hash } = await ingest.content('f1', Readable.from([slides]));
    const prisma = app.get(PrismaService);
    await prisma.representation.create({
      data: {
        hash,
        processor: 'office-text',
        version: 1,
        parts: ['page one', 'page two'],
      },
    });
    fileId = (
      await prisma.file.findUniqueOrThrow({
        where: { portal_externalId: { portal: PORTAL, externalId: 'f1' } },
      })
    ).id;

    const commands = app.get(CommandBus);
    await commands.execute(
      new CreateCourseCommand('sys', 'Operativni sistemi'),
    );
    await commands.execute(
      new LinkPortalCourseCommand('sys', PORTAL, 'c1', 2026),
    );

    student = await signUp('student@rest.test');
    stranger = await signUp('stranger@rest.test');
    const { id } = await prisma.user.findUniqueOrThrow({
      where: { email: 'student@rest.test' },
    });
    await commands.execute(new GrantCourseAccessCommand(id, 'sys'));
  });

  afterAll(() => app.close());

  it('needs a signed-in user', async () => {
    await http().get('/api/courses').expect(401);
  });

  it("lists a student's courses and what's in them", async () => {
    const courses = await get('/api/courses', student).expect(200);
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

    const second = await get(
      '/api/courses/sys/items?offset=1&limit=1',
      student,
    ).expect(200);
    expect(second.body.map((i: { title: string }) => i.title)).toEqual([
      'post old',
    ]);
    await get('/api/courses/sys/items?limit=500', student).expect(400);

    const files = await get('/api/courses/sys/files', student).expect(200);
    expect(files.body).toEqual([
      expect.objectContaining({
        id: fileId,
        name: 'Predavanje 1 — procesi.pdf',
        path: 'lectures',
        hasContent: true,
      }),
    ]);
  });

  it('reads a file as text page by page, or downloads it', async () => {
    const file = await get(`/api/files/${fileId}`, student).expect(200);
    expect(file.body.texts).toEqual([
      { processor: 'office-text', version: 1, pages: 2 },
    ]);

    const page = await get(`/api/files/${fileId}/text?page=2`, student).expect(
      200,
    );
    expect(page.body).toEqual({
      processor: 'office-text',
      version: 1,
      page: 2,
      pages: 2,
      text: 'page two',
    });
    await get(`/api/files/${fileId}/text?page=3`, student).expect(404);

    const content = await get(`/api/files/${fileId}/content`, student)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(createHash('sha256').update(content.body).digest('hex')).toBe(
      createHash('sha256').update(slides).digest('hex'),
    );
    expect(content.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('Predavanje 1 — procesi.pdf')}`,
    );
  });

  it("shows nothing of courses the user wasn't given", async () => {
    expect((await get('/api/courses', stranger).expect(200)).body).toEqual([]);
    await get('/api/courses/sys/items', stranger).expect(404);
    await get('/api/courses/sys/files', stranger).expect(404);
    await get(`/api/files/${fileId}`, stranger).expect(404);
    await get(`/api/files/${fileId}/text`, stranger).expect(404);
    await get(`/api/files/${fileId}/content`, stranger).expect(404);
    // the same answer as for things that don't exist
    await get('/api/courses/nope/items', student).expect(404);
  });

  it('describes itself in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/courses',
        '/api/courses/{slug}/items',
        '/api/files/{id}/text',
        '/api/files/{id}/content',
      ]),
    );
  });
});
