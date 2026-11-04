import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import iconv from 'iconv-lite';
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

// plain-text as the hub runs it: found among the plugins, a thread of its
// own, its parts stored and read back page by page. What it makes of a
// file is checked in its unit specs.

const PORTAL = 'plain-text-test';
const notes = '# Uvod\n\nČitati pažljivo.\n\n# Zadatak\n\nŠta se dešava?\n';

describe('plain-text', { timeout: 30_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => app, mails);
  let admin: string;
  let fileId: string;

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
    ({ id: fileId } = await app.get(PrismaService).file.findUniqueOrThrow({
      where: { portal_externalId: { portal: PORTAL, externalId: 'notes' } },
    }));

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
    const get = (path: string) => http().get(path).set('cookie', admin);
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
});
