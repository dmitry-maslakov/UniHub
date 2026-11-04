import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PortalId } from '@app/kernel';
import { CanvasModule } from '@app/plugins/canvas';
import {
  CANVAS_URL,
  FakeCanvas,
  TOKEN,
} from '@app/plugins/canvas/canvas.fakes.js';
import { Connection } from '../src/ingest/contracts.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { SyncConnectionCommand } from '../src/plugins/contracts.js';
import {
  CONNECTORS_QUEUE,
  type ConnectorJob,
} from '../src/plugins/infrastructure/connectors.queue.js';
import { bootApp } from './app.js';
import { sha256 } from './sha256.js';

// The canvas plugin as the hub runs it, against a made-up Canvas: found by
// its decorator, its settings read from the environment, a poll queued and
// its records and content through ingest into catalog and storage. What
// it reads and sends is checked in its unit specs.

const portal = 'canvas';
const connection = Connection.shared(PortalId.parse(portal));

describe('canvas', { timeout: 30_000 }, () => {
  let app: INestApplication;
  const canvas = new FakeCanvas();

  beforeAll(async () => {
    vi.stubEnv('CANVAS_URL', CANVAS_URL);
    vi.stubEnv('CANVAS_TOKEN', TOKEN);
    // the app's other connections (postgres, redis) aren't HTTP; the
    // tests' own requests would be
    canvas.server.listen({ onUnhandledFrame: 'bypass' });
    app = await bootApp({ imports: [CanvasModule] });
  });

  afterAll(async () => {
    await app.close();
    canvas.server.close();
    vi.unstubAllEnvs();
  });

  it('polls Canvas into the catalog', async () => {
    const queue = app.get<Queue<ConnectorJob>>(getQueueToken(CONNECTORS_QUEUE));
    await app.get(CommandBus).execute(new SyncConnectionCommand(connection));
    const poll = await queue.getDeduplicationJobId(connection.key);
    await vi.waitFor(
      async () => expect(await queue.getJobState(poll!)).toBe('completed'),
      { timeout: 20_000, interval: 200 },
    );

    const prisma = app.get(PrismaService);
    expect(
      await prisma.file.findUnique({
        where: { portal_externalId: { portal, externalId: '3001' } },
      }),
    ).toMatchObject({
      path: 'Lectures',
      contentHash: sha256('%PDF lecture one'),
    });
    expect(
      await prisma.portalCourse.findMany({
        where: { portal },
        select: { externalId: true, name: true },
      }),
    ).toEqual([{ externalId: '101', name: 'Operating Systems' }]);
    const items = await prisma.item.findMany({
      where: { portal },
      select: { externalId: true },
    });
    expect(items.map((item) => item.externalId).sort()).toEqual([
      'assignment:901',
      'module:501',
      'page:801',
      'page:802',
      'topic:701',
    ]);
  });
});
