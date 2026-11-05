import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import iconv from 'iconv-lite';
import yazl from 'yazl';
import { PortalId } from '@app/kernel';
import { PlainTextModule } from '@app/plugins/plain-text';
import {
  CourseName,
  CreateCourseCommand,
  LinkPortalCourseCommand,
  Slug,
} from '../src/catalog/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { bootApp } from './app.js';
import { accounts } from './accounts.js';
import { portalIngest } from './ingest.js';

// plain-text and archive-text as the hub runs them: found among the
// plugins, a thread of their own, their parts stored and read back page by
// page. What they make of a file is checked in their unit specs.

const PORTAL = 'plain-text-test';
const notes = '# Uvod\n\nČitati pažljivo.\n\n# Zadatak\n\nŠta se dešava?\n';
const labs = {
  'lab/main.c': 'int main(void) { return 0; }\n',
  'lab/plot.py': 'print("graf")\n',
  'README.md': '# Vežbe\n',
};

async function zipOf(files: Record<string, string>) {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files))
    zip.addBuffer(Buffer.from(content), name);
  zip.end();
  return buffer(zip.outputStream);
}

describe('plain-text', { timeout: 30_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => app, mails);
  let admin: string;
  let fileId: string;
  let archiveId: string;
  const get = (path: string) => http().get(path).set('cookie', admin);

  beforeAll(async () => {
    app = await bootApp({ mails, imports: [PlainTextModule] });
    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Prevodioci' });
    await ingest.file({ externalId: 'notes', course: 'c1', name: 'notes.md' });
    // written on Windows, in its code page
    await ingest.content(
      'notes',
      Readable.from([iconv.encode(notes, 'win1250')]),
    );
    await ingest.file({ externalId: 'labs', course: 'c1', name: 'labs.zip' });
    await ingest.content('labs', Readable.from([await zipOf(labs)]));
    const idOf = async (externalId: string) =>
      (
        await app.get(PrismaService).file.findUniqueOrThrow({
          where: { portal_externalId: { portal: PORTAL, externalId } },
        })
      ).id;
    fileId = await idOf('notes');
    archiveId = await idOf('labs');

    const commands = app.get(CommandBus);
    await commands.execute(
      new CreateCourseCommand(Slug.parse('ppj'), CourseName.parse('PPJ')),
    );
    await commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse('ppj'),
        { portal: PortalId.parse(PORTAL), externalId: 'c1' },
        null,
      ),
    );
    admin = await signUp('admin@plain-text.test');
    await makeAdmin('admin@plain-text.test');
  });

  afterAll(() => app.close());

  it('turns a text file into pages a reader gets', async () => {
    await vi.waitFor(
      async () =>
        expect(
          (await get(`/api/files/${fileId}`).expect(200)).body.texts,
        ).toEqual([{ processor: 'plain-text', version: 1, pages: 2 }]),
      { timeout: 20_000, interval: 200 },
    );

    const page = await get(`/api/files/${fileId}/text?page=2`).expect(200);
    expect(page.body.text).toBe('# Zadatak\n\nŠta se dešava?\n');
  });

  it('turns the text files of an archive into pages naming each', async () => {
    await vi.waitFor(
      async () =>
        expect(
          (await get(`/api/files/${archiveId}`).expect(200)).body.texts,
        ).toEqual([{ processor: 'archive-text', version: 1, pages: 3 }]),
      { timeout: 20_000, interval: 200 },
    );

    const pages = await Promise.all(
      [1, 2, 3].map(
        async (page) =>
          (await get(`/api/files/${archiveId}/text?page=${page}`).expect(200))
            .body.text,
      ),
    );
    expect(pages).toEqual(
      Object.entries(labs).map(([path, text]) => `${path}\n\n${text}`),
    );
  });
});
