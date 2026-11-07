import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { NO_INSTANCE, PortalId } from '@app/kernel';
import { ArchivesModule } from '@app/plugins/archives';
import {
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import { GrantCourseAccessCommand } from '../src/identity/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { portalIngest } from './ingest.js';

// Several files as one zip through the API: the wiring (Redis, the routes,
// the zip on the wire). Who may download what is checked on fakes
// (Downloads, CourseReader), the entry names in zipEntryNames's spec.

const PORTAL = 'downloads-test';
const slides = Buffer.from('%PDF slides about caches');
const notes = Buffer.from('notes at the top');
const main = 'int main(void) { return 0; }\n';

async function zipOf(files: Record<string, string>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    zip.addBuffer(Buffer.from(content), name);
  zip.end();
  return buffer(zip.outputStream);
}

// every entry of a zip, by name
async function unzipped(data: Buffer) {
  const zip = await yauzl.fromBufferPromise(data);
  const entries = new Map<string, string>();
  for await (const entry of zip.eachEntry()) {
    const stream = await zip.openReadStreamPromise(entry);
    entries.set(entry.fileName, (await buffer(stream)).toString());
  }
  return entries;
}

describe('downloads', { timeout: 30_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, userId } = accounts(() => app, mails);
  let student: string;
  let stranger: string;
  const ids: Record<string, string> = {};

  const post = (cookie: string, items: object[]) =>
    http().post('/api/downloads').set('cookie', cookie).send({ items });
  const fetchZip = (url: string, cookie: string) =>
    http()
      .get(url)
      .set('cookie', cookie)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  beforeAll(async () => {
    app = await bootApp({ mails, imports: [ArchivesModule] });
    const prisma = app.get(PrismaService);
    const commands = app.get(CommandBus);

    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Arhitektura' });
    await ingest.course({ externalId: 'c2', name: 'Ispiti' });
    const files: [string, string, string, string, Buffer][] = [
      ['slides', 'c1', 'lectures', 'slides.pdf', slides],
      ['notes', 'c1', '', 'notes.txt', notes],
      ['labs', 'c1', 'Labs', 'labs.zip', await zipOf({ 'lab/a.c': main })],
      ['exam', 'c2', '', 'exam.pdf', Buffer.from('%PDF answers')],
    ];
    for (const [externalId, course, path, name, content] of files) {
      await ingest.file({
        externalId,
        course,
        path,
        name,
        size: content.length,
      });
      await ingest.content(externalId, Readable.from([content]));
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

    for (const [slug, externalId] of [
      ['ar', 'c1'],
      ['ispiti', 'c2'],
    ] as const) {
      await commands.execute(
        new CreateCourseCommand(Slug.parse(slug), CourseName.parse(slug)),
      );
      await commands.execute(
        new LinkPortalCourseCommand(
          Slug.parse(slug),
          { portal: PortalId.parse(PORTAL), instance: NO_INSTANCE, externalId },
          null,
        ),
      );
    }
    student = await signUp('student@downloads.test');
    stranger = await signUp('stranger@downloads.test');
    const { id: ar } = await prisma.course.findUniqueOrThrow({
      where: { slug: 'ar' },
    });
    await commands.execute(
      new GrantCourseAccessCommand(await userId('student@downloads.test'), ar),
    );
    // the archive's members, once the unpacker is done with it
    await vi.waitFor(
      async () =>
        expect(await prisma.member.count({ where: { path: 'lab/a.c' } })).toBe(
          1,
        ),
      { timeout: 20_000, interval: 250 },
    );
  });

  afterAll(() => app.close());

  it('zips two files and a member', async () => {
    const created = await post(student, [
      { file: ids.slides },
      { file: ids.notes },
      { file: ids.labs, member: 'lab/a.c' },
    ]).expect(201);

    // 10 a minute per user
    expect(created.headers['x-ratelimit-limit-downloads']).toBe('10');
    expect(created.body).toEqual({
      url: expect.stringMatching(/^\/api\/downloads\/[\w-]{22}$/),
      name: 'ar.zip',
      count: 3,
      size: slides.length + notes.length + main.length,
    });

    // fetched more than once, as a browser's retry would
    for (let again = 0; again < 2; again++) {
      const zip = await fetchZip(created.body.url, student).expect(200);
      expect(zip.headers['content-type']).toBe('application/zip');
      expect(zip.headers['x-content-type-options']).toBe('nosniff');
      expect(zip.headers['content-disposition']).toBe(
        'attachment; filename=ar.zip',
      );
      expect(await unzipped(zip.body)).toEqual(
        new Map([
          ['lectures/slides.pdf', slides.toString()],
          ['notes.txt', notes.toString()],
          ['Labs/labs/lab/a.c', main],
        ]),
      );
    }
  });

  it("refuses another user's download, and an unknown one", async () => {
    const { body } = await post(student, [{ file: ids.notes }]).expect(201);

    await fetchZip(body.url, stranger).expect(404);
    await fetchZip('/api/downloads/not-an-id', student).expect(404);
  });

  it("refuses a file the user doesn't read, naming none", async () => {
    const refused = await post(student, [
      { file: ids.notes },
      { file: ids.exam },
    ]).expect(404);
    expect(JSON.stringify(refused.body)).not.toContain('exam');
    // a member that was not kept
    await post(student, [{ file: ids.labs, member: 'lab/gone.c' }]).expect(404);
    // nor can a stranger ask for what the student may
    await post(stranger, [{ file: ids.notes }]).expect(404);
    await post(student, []).expect(400);
  });
});
