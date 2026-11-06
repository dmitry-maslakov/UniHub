import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { gzipSync } from 'node:zlib';
import type { INestApplication } from '@nestjs/common';
import tar from 'tar-stream';
import yazl from 'yazl';
import { ArchivesModule } from '@app/plugins/archives';
import { OfficeTextModule } from '@app/plugins/office-text';
import { PlainTextModule } from '@app/plugins/plain-text';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { bootApp } from './app.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// archives as the hub runs it: found among the plugins, the members of a
// zip stored and each read by the processor that takes its name
// (office-text the pdf), a tgz in it opened in the same walk. What it makes
// of an archive is checked in its unit specs, the walk's rules in
// processing's.

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
  // what a processor made of a member's content
  const text = async (content: string | Buffer, processor: string) => {
    const stored = await prisma.representation.findFirst({
      where: { hash: sha256(content), processor },
    });
    return (stored?.parts as string[] | undefined)?.join('\n');
  };

  beforeAll(async () => {
    app = await bootApp({
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
    await ingest.file({ externalId: 'labs', name: 'labs.zip' });
    await ingest.content('labs', Readable.from([zip]));
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
});
