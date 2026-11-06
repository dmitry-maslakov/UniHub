import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
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
import {
  EmbedderUnavailableError,
  QueryEmbedder,
} from '../src/processing/application/ports.js';
import { accounts } from './accounts.js';
import { bootApp } from './app.js';
import { portalIngest } from './ingest.js';

// An archive as the hub runs it: archives expands it, each entry is stored
// and read by the processor that takes its path (office-text the pdf), and
// the file's text and search come back with the entries' paths. What each
// part makes of it is checked in its unit specs.

const PORTAL = 'archives-test';
const lecture = readFileSync(
  new URL(
    '../libs/plugins/office-text/src/fixtures/lecture.pdf',
    import.meta.url,
  ),
);

async function zipOf(files: Record<string, string | Buffer>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    zip.addBuffer(Buffer.from(content), name);
  zip.end();
  return buffer(zip.outputStream);
}

describe('archives', { timeout: 60_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => app, mails);
  let admin: string;
  let fileId: string;
  const get = (path: string) => http().get(path).set('cookie', admin);
  // in its course, by the words alone, as while the query embedder is away
  const searched = async (q: string) => {
    vi.spyOn(app.get(QueryEmbedder), 'embed').mockRejectedValueOnce(
      new EmbedderUnavailableError('embedder.invalid: ENOTFOUND'),
    );
    return (await get(`/api/search?q=${q}&course=ar`).expect(200)).body.results;
  };

  beforeAll(async () => {
    app = await bootApp({
      mails,
      imports: [ArchivesModule, PlainTextModule, OfficeTextModule],
    });
    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Arhitektura' });
    await ingest.file({ externalId: 'labs', course: 'c1', name: 'labs.zip' });
    const zip = await zipOf({
      'lab/semafor.c': 'int semafor = 1;\n',
      'lab/plot.py': 'print("histogram")\n',
      'README.md': '# Vežbe\n',
      'docs/lecture.pdf': lecture,
    });
    await ingest.content('labs', Readable.from([zip]));
    ({ id: fileId } = await app.get(PrismaService).file.findUniqueOrThrow({
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

  it("reads an archive's entries as its texts, a page each under its path", async () => {
    await vi.waitFor(
      async () =>
        expect(
          (await get(`/api/files/${fileId}`).expect(200)).body.texts,
        ).toEqual([
          { processor: 'office-text', version: 2, pages: 2 },
          { processor: 'plain-text', version: 1, pages: 3 },
        ]),
      { timeout: 30_000, interval: 200 },
    );

    const page = async (processor: string, n: number) =>
      (
        await get(
          `/api/files/${fileId}/text?page=${n}&processor=${processor}`,
        ).expect(200)
      ).body.text;
    expect(await page('office-text', 2)).toBe(
      'docs/lecture.pdf\n\nDirect mapped caches',
    );
    expect(await page('plain-text', 1)).toBe(
      'lab/semafor.c\n\nint semafor = 1;\n',
    );
  });

  it('finds the archive by its entries, on pages that name them', async () => {
    for (const [q, processor, path] of [
      ['semafor', 'plain-text', 'lab/semafor.c'],
      ['caches', 'office-text', 'docs/lecture.pdf'],
    ]) {
      const results = await vi.waitFor(
        async () => {
          const found = await searched(q);
          expect(found.map((r: { fileId: string }) => r.fileId)).toEqual([
            fileId,
          ]);
          return found;
        },
        { timeout: 30_000, interval: 500 },
      );
      const [best] = results[0].pages;
      expect(best.processor).toBe(processor);
      const read = await get(
        `/api/files/${fileId}/text?page=${best.page}&processor=${processor}`,
      ).expect(200);
      expect(read.body.text.startsWith(`${path}\n\n`)).toBe(true);
    }
  });
});
