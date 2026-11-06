import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import tar from 'tar-stream';
import yazl from 'yazl';
import { PortalId } from '@app/kernel';
import { ArchivesModule } from '@app/plugins/archives';
import { OfficeTextModule } from '@app/plugins/office-text';
import { PlainTextModule } from '@app/plugins/plain-text';
import {
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// archives as the hub runs it: found among the plugins, the members of a
// zip stored and each read by the processor that takes its name
// (office-text the pdf), a tgz in it opened in the same walk, then read
// through the API inside the file. What it makes of an archive is checked
// in its unit specs, the walk's rules in processing's, who reads which
// member on fakes (CourseReader).

const PORTAL = 'archives-test';
const lecture = readFileSync(
  new URL(
    '../libs/plugins/office-text/src/fixtures/lecture.pdf',
    import.meta.url,
  ),
);
const semafor = 'int semafor = 1;\n';
const inner = 'int inner = 2;\n';

async function zipOf(files: Record<string, string | Buffer>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    zip.addBuffer(Buffer.from(content), name);
  zip.end();
  return buffer(zip.outputStream);
}

async function tgzOf(files: Record<string, string>) {
  const pack = tar.pack();
  for (const [name, content] of Object.entries(files))
    pack.entry({ name }, content);
  pack.finalize();
  return gzipSync(await buffer(pack));
}

describe('archives', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let zip: Buffer;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => app, mails);
  let admin: string;
  let fileId: string;
  const get = (path: string) => http().get(path).set('cookie', admin);
  // what a processor made of a member's content
  const text = async (content: string | Buffer, processor: string) => {
    const stored = await prisma.representation.findFirst({
      where: { hash: sha256(content), processor },
    });
    return (stored?.parts as string[] | undefined)?.join('\n');
  };

  beforeAll(async () => {
    app = await bootApp({
      mails,
      imports: [ArchivesModule, PlainTextModule, OfficeTextModule],
    });
    prisma = app.get(PrismaService);
    zip = await zipOf({
      'lab/semafor.c': semafor,
      'lab/plot.py': 'print("histogram")\n',
      'README.md': '# Vežbe\n',
      'docs/lecture.pdf': lecture,
      'lab/old.tgz': await tgzOf({ 'inner.c': inner }),
    });
    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Arhitektura' });
    await ingest.file({ externalId: 'labs', course: 'c1', name: 'labs.zip' });
    await ingest.content('labs', Readable.from([zip]));
    ({ id: fileId } = await prisma.file.findUniqueOrThrow({
      where: { portal_externalId: { portal: PORTAL, externalId: 'labs' } },
    }));

    const commands = app.get(CommandBus);
    await commands.execute(
      new CreateCourseCommand(Slug.parse('ar'), CourseName.parse('AR')),
    );
    await commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse('ar'),
        { portal: PortalId.parse(PORTAL), externalId: 'c1' },
        null,
      ),
    );
    admin = await signUp('admin@archives.test');
    await makeAdmin('admin@archives.test');
  });

  afterAll(() => app.close());

  it("stores an archive's members, then the texts the processors make of them", async () => {
    await vi.waitFor(
      async () => {
        expect(await text(semafor, 'plain-text')).toContain('semafor');
        expect(await text('print("histogram")\n', 'plain-text')).toContain(
          'histogram',
        );
        expect(await text('# Vežbe\n', 'plain-text')).toContain('Vežbe');
        expect(await text(lecture, 'office-text')).toBeTruthy();
        expect(await text(inner, 'plain-text')).toContain('inner');
      },
      { timeout: 45_000, interval: 500 },
    );

    const members = await prisma.member.findMany({
      where: { hash: sha256(zip) },
      orderBy: { position: 'asc' },
    });
    expect(members.map(({ path }) => path)).toEqual([
      'lab/semafor.c',
      'lab/plot.py',
      'README.md',
      'docs/lecture.pdf',
      'lab/old.tgz',
      'lab/old.tgz/inner.c',
    ]);
  });

  it("reads an archive's members through the API, each by its path", async () => {
    const members = (await get(`/api/files/${fileId}/members`).expect(200))
      .body;
    expect(members).toContainEqual({
      path: 'lab/semafor.c',
      size: semafor.length,
      mime: null,
      leftOut: null,
      texts: [{ processor: 'plain-text', version: 1, pages: 1 }],
    });
    expect(members.map(({ path }: { path: string }) => path)).toContain(
      'lab/old.tgz/inner.c',
    );

    const page = async (member: string, processor = 'plain-text', n = 1) =>
      (
        await get(
          `/api/files/${fileId}/text?member=${encodeURIComponent(member)}&page=${n}&processor=${processor}`,
        ).expect(200)
      ).body.text;
    expect(await page('lab/semafor.c')).toBe(semafor);
    expect(await page('lab/plot.py')).toContain('histogram');
    expect(await page('README.md')).toContain('Vežbe');
    expect(await page('lab/old.tgz/inner.c')).toBe(inner);
    expect(await page('docs/lecture.pdf', 'office-text', 2)).toBe(
      'Direct mapped caches',
    );

    const content = await get(
      `/api/files/${fileId}/content?member=lab/semafor.c`,
    )
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(content.headers['content-disposition']).toBe(
      'attachment; filename=semafor.c',
    );
    expect(content.headers['content-type']).toBe('application/octet-stream');
    expect(content.body.toString()).toBe(semafor);
    await get(`/api/files/${fileId}/text?member=lab/gone.c`).expect(404);
  });
});
