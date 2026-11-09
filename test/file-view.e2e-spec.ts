import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import sharp from 'sharp';
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
import { accounts } from './accounts.js';
import { portalIngest } from './ingest.js';

// A file as a picture, once through each way in: the route and the tool.
// What is viewable and how big it is drawn are checked in unit specs; here
// the wiring is: the real renderer behind the access a content read has.

const PORTAL = 'view-test';
const lecture = readFileSync(
  new URL(
    '../libs/plugins/office-text/src/fixtures/lecture.pdf',
    import.meta.url,
  ),
);

describe('File view', { timeout: 30_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signUp, userId } = accounts(() => app, mails);
  let reader: string;
  let stranger: string;
  let key: string;
  const ids: Record<string, string> = {};

  const view = (path: string, cookie = reader) =>
    http()
      .get(`/api/files/${path}`)
      .set('cookie', cookie)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
  const tool = (args: object) =>
    http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set('x-api-key', key)
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'view_file', arguments: args },
      })
      .expect(200)
      .then(
        (res) =>
          res.body.result as {
            isError?: boolean;
            content: { type: string; text?: string; data?: string }[];
          },
      );

  beforeAll(async () => {
    app = await bootApp({ mails });
    const prisma = app.get(PrismaService);
    const ingest = portalIngest(app, PORTAL);
    await ingest.course({ externalId: 'c1', name: 'Physics 2026' });
    const wide = await sharp({
      create: {
        width: 3200,
        height: 800,
        channels: 3,
        background: { r: 20, g: 80, b: 160 },
      },
    })
      .png()
      .toBuffer();
    for (const [externalId, name, mime, content] of [
      ['plot', 'plot.png', 'image/png', wide],
      ['lecture', 'lecture.pdf', 'application/pdf', lecture],
      ['notes', 'notes.txt', 'text/plain', Buffer.from('just words')],
    ] as const) {
      await ingest.file({ externalId, course: 'c1', name, mime });
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
    const commands = app.get(CommandBus);
    const { id: courseId } = await commands.execute(
      new CreateCourseCommand(Slug.parse('phys'), CourseName.parse('Fizika')),
    );
    await commands.execute(
      new LinkPortalCourseCommand(
        Slug.parse('phys'),
        {
          portal: PortalId.parse(PORTAL),
          instance: NO_INSTANCE,
          externalId: 'c1',
        },
        AcademicYear.parse(2026),
      ),
    );
    reader = await signUp('reader@view.test');
    stranger = await signUp('stranger@view.test');
    await commands.execute(
      new GrantCourseAccessCommand(await userId('reader@view.test'), courseId),
    );
    key = (
      await post('/api-key/create', { name: 'claude' }, reader).expect(200)
    ).body.key;
  });

  afterAll(() => app.close());

  const jpegOf = async (data: Buffer) => {
    expect([...data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    return sharp(data).metadata();
  };

  it('answers an image as a JPEG that fits', async () => {
    const res = await view(`${ids.plot}/view`).expect(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
    expect(res.headers['x-page-count']).toBeUndefined();
    expect(res.headers['x-ratelimit-limit-views']).toBe('60');
    const { width, height } = await jpegOf(res.body);
    expect(width).toBe(1568);
    expect(height).toBe(392);
  });

  it('answers a page of a PDF, and how many it has', async () => {
    const res = await view(`${ids.lecture}/view?page=1`).expect(200);
    const pages = Number(res.headers['x-page-count']);
    expect(pages).toBeGreaterThan(0);
    const { width, height } = await jpegOf(res.body);
    expect(Math.max(width!, height!)).toBeLessThanOrEqual(1568);
    await view(`${ids.lecture}/view?page=${pages + 1}`).expect(404);
  });

  it('turns away a user who does not read the file, and a file that is no picture', async () => {
    await view(`${ids.plot}/view`, stranger).expect(404);
    const text = await view(`${ids.notes}/view`).expect(422);
    expect(JSON.parse(text.body.toString())).toMatchObject({
      code: 'NOT_VIEWABLE',
    });
    await view(`${ids.lecture}/view?page=0`).expect(400);
  });

  it('gives an agent the picture and a line saying what it is', async () => {
    const image = await tool({ file: ids.plot });
    const [picture, caption] = image.content;
    expect(picture!.type).toBe('image');
    expect((await jpegOf(Buffer.from(picture!.data!, 'base64'))).width).toBe(
      1568,
    );
    expect(caption!.text).toBe('plot.png');

    const page = await tool({ file: ids.lecture, page: 1 });
    expect(page.content[0]!.type).toBe('image');
    expect(page.content[1]!.text).toMatch(/^lecture\.pdf, page 1 of \d+$/);

    const none = await tool({ file: ids.notes });
    expect(none.isError).toBe(true);
    expect(none.content[0]!.text).toContain('not viewable');
  });
});
