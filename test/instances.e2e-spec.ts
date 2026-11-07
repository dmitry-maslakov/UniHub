import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Module,
  type INestApplication,
  type INestApplicationContext,
} from '@nestjs/common';
import { Instance, PollConnector, PortalId } from '@app/plugin-sdk';
import { NO_INSTANCE } from '@app/kernel';
import { Connection } from '../src/ingest/contracts.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ConnectionDirectory } from '../src/plugins/application/connection-directory.js';
import { accounts, ORIGIN } from './accounts.js';
import { bootApp, bootWorker } from './app.js';

// A portal that is a site per school as the app wires it: rows from before
// given the site its settings name, by a worker as it starts, a record kept
// twice merged by the SQL that adopts them, which an app from before can't
// insert again; a shared run's records stamped with that site, and an
// admin's link naming a portal course of it. The other rules are checked
// on fakes (InstanceAdoption, ConnectionDirectory, PluginCatalog).

const PORTAL = 'sites-lms';
const OTHER = 'sites-other';
const SITE = 'https://lms.example.edu';

@PollConnector({ portal: PORTAL, schedule: '0 0 1 1 *', instances: true })
@Injectable()
class SitesPortal {
  async poll() {}
  configuredInstance() {
    return Instance.parse(SITE);
  }
}

@Module({ providers: [SitesPortal] })
class SitesModule {}

describe('instances', { timeout: 30_000 }, () => {
  let api: INestApplication;
  let worker: INestApplicationContext | undefined;
  const mails: Mail[] = [];
  const { http, signUp, makeAdmin } = accounts(() => api, mails);

  beforeAll(async () => {
    api = await bootApp({ role: 'api', mails, imports: [SitesModule] });
  });

  afterAll(async () => {
    await worker?.close();
    await api.close();
  });

  it('gives rows from before their site as a worker starts, one kept twice the same record', async () => {
    const prisma = api.get(PrismaService);
    const old = (portal: string, externalId: string) => ({
      id: randomUUID(),
      portal,
      externalId,
    });
    await prisma.portalCourse.createMany({
      data: [old(PORTAL, 'c1'), old(OTHER, 'c1')],
    });
    await prisma.item.create({ data: old(PORTAL, 'p1') });
    await prisma.file.create({ data: old(PORTAL, 'f1') });
    await prisma.portalAccount.create({
      data: {
        id: randomUUID(),
        portal: PORTAL,
        userId: 'someone-from-before',
        mode: 'token',
        portalUser: '4242',
      },
    });
    // a course a run sent, and one of its site beside it, made for an
    // admin's link before the worker came: the link goes to the first
    const sent = old(PORTAL, 'linked');
    await prisma.portalCourse.create({ data: sent });
    await prisma.courseVersion.create({
      data: { id: sent.id, portalCourseId: sent.id, name: 'OS' },
    });
    const early = await prisma.portalCourse.create({
      data: { ...old(PORTAL, 'linked'), instance: SITE },
    });
    await prisma.course.create({
      data: {
        slug: 'sites-early',
        name: 'OS',
        links: { create: { portalCourseId: early.id } },
      },
    });
    // a file runs sent both ways: left as it is
    for (const instance of [NO_INSTANCE, SITE]) {
      const file = await prisma.file.create({
        data: { ...old(PORTAL, 'twice'), instance },
      });
      await prisma.fileVersion.create({
        data: { id: file.id, fileId: file.id, name: 'a.pdf' },
      });
    }
    const site = async (
      rows: { findFirstOrThrow: (q: object) => Promise<{ instance: string }> },
      where: object,
    ) => (await rows.findFirstOrThrow({ where })).instance;
    const sites = async () => ({
      course: await site(prisma.portalCourse, {
        portal: PORTAL,
        externalId: 'c1',
      }),
      item: await site(prisma.item, { portal: PORTAL }),
      file: await site(prisma.file, { portal: PORTAL, externalId: 'f1' }),
      account: await site(prisma.portalAccount, { portal: PORTAL }),
      other: await site(prisma.portalCourse, { portal: OTHER }),
    });

    worker = await bootWorker({ imports: [SitesModule] });
    await vi.waitFor(async () => expect((await sites()).course).toBe(SITE), {
      timeout: 10_000,
      interval: 100,
    });
    expect(await sites()).toEqual({
      course: SITE,
      item: SITE,
      file: SITE,
      account: SITE,
      other: NO_INSTANCE,
    });
    expect(
      await prisma.portalCourse.findMany({
        where: { portal: PORTAL, externalId: 'linked' },
        select: {
          id: true,
          instance: true,
          link: { select: { course: { select: { slug: true } } } },
        },
      }),
    ).toEqual([
      {
        id: sent.id,
        instance: SITE,
        link: { course: { slug: 'sites-early' } },
      },
    ]);
    expect(
      (
        await prisma.file.findMany({
          where: { portal: PORTAL, externalId: 'twice' },
          orderBy: { instance: 'asc' },
        })
      ).map(({ instance }) => instance),
    ).toEqual([NO_INSTANCE, SITE]);
    // an app from before can't keep a record of the site twice
    await expect(
      prisma.portalCourse.create({ data: old(PORTAL, 'c1') }),
    ).rejects.toThrow();
  });

  it("stamps a shared run's records with the site its settings name, and an admin links a portal course of it", async () => {
    const prisma = api.get(PrismaService);
    const found = await api
      .get(ConnectionDirectory)
      .context(
        Connection.shared(PortalId.parse(PORTAL)),
        new AbortController().signal,
      );
    await found!.context.ingest.course({ externalId: 'c2', name: 'OS' });
    expect(
      await prisma.portalCourse.findFirstOrThrow({
        where: { portal: PORTAL, externalId: 'c2' },
      }),
    ).toMatchObject({ instance: SITE });

    const admin = await signUp('admin@instances.test');
    await makeAdmin('admin@instances.test');
    const as = (method: 'post' | 'put', path: string, body: object) =>
      http()
        [method](path)
        .set('origin', ORIGIN)
        .set('cookie', admin)
        .send(body);
    await as('post', '/api/courses', { slug: 'sites-os', name: 'OS' }).expect(
      201,
    );
    for (const externalId of ['c2', 'c3'])
      await as('put', `/api/portal-courses/${PORTAL}/${externalId}/course`, {
        course: 'sites-os',
      }).expect(204);
    const linked = await prisma.courseLink.findMany({
      where: { course: { slug: 'sites-os' } },
      select: {
        portalCourse: { select: { instance: true, externalId: true } },
      },
    });
    expect(
      linked
        .map(({ portalCourse }) => portalCourse)
        .sort((a, b) => a.externalId.localeCompare(b.externalId)),
    ).toEqual([
      { instance: SITE, externalId: 'c2' },
      { instance: SITE, externalId: 'c3' },
    ]);
  });
});
