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
import { InstanceAdoption } from '../src/plugins/contracts.js';
import { accounts, ORIGIN } from './accounts.js';
import { bootApp, bootWorker } from './app.js';

// A portal that is a site per school as the app wires it: rows from before
// given the site its settings name, by a worker as it starts and in one
// transaction; a shared run's records stamped with that site, and an
// admin's link naming a portal course of it. The rules are checked on
// fakes (InstanceAdoption, ConnectionDirectory, PluginCatalog).

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

  it('gives rows from before their site as a worker starts, all of them in one transaction or none', async () => {
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
    // one of its site already beside one from before: stamping the old one
    // fails, and nothing of it is kept
    await prisma.file.createMany({
      data: [{ ...old(PORTAL, 'twin'), instance: SITE }, old(PORTAL, 'twin')],
    });
    const sites = async () => ({
      course: (
        await prisma.portalCourse.findFirstOrThrow({
          where: { portal: PORTAL, externalId: 'c1' },
        })
      ).instance,
      item: (await prisma.item.findFirstOrThrow({ where: { portal: PORTAL } }))
        .instance,
      file: (
        await prisma.file.findFirstOrThrow({
          where: { portal: PORTAL, externalId: 'f1' },
        })
      ).instance,
      account: (
        await prisma.portalAccount.findFirstOrThrow({
          where: { portal: PORTAL },
        })
      ).instance,
      other: (
        await prisma.portalCourse.findFirstOrThrow({
          where: { portal: OTHER },
        })
      ).instance,
    });

    await expect(api.get(InstanceAdoption).done()).rejects.toThrow();
    expect(Object.values(await sites())).toEqual(Array(5).fill(NO_INSTANCE));

    await prisma.file.deleteMany({
      where: { portal: PORTAL, instance: NO_INSTANCE, externalId: 'twin' },
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
