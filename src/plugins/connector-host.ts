import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { ConnectorContext, PushesFromPortal } from '@app/plugin-sdk';
import { HubIngest } from '../ingest/contracts.js';
import {
  CONNECTORS_QUEUE,
  connectionKey,
  type ConnectorJob,
} from './connectors.queue.js';
import { PluginRegistry } from './plugin-registry.js';
import { pluginsConfig } from './plugins.config.js';

// Runs connectors: schedules poll connectors, starts and stops push ones.
// A connector only ever sees one connection (portal + account).
@Injectable()
export class ConnectorHost implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ConnectorHost.name);
  private readonly started: PushesFromPortal[] = [];

  constructor(
    private readonly registry: PluginRegistry,
    private readonly ingest: HubIngest,
    @InjectQueue(CONNECTORS_QUEUE) private readonly queue: Queue<ConnectorJob>,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
  ) {}

  // the one place that knows a portal's accounts; per-user ones come with auth
  accounts(portal: string) {
    return portal ? ['shared'] : [];
  }

  context(portal: string, account: string): ConnectorContext {
    return { account, ingest: this.ingest.forPortal(portal, account) };
  }

  // also what "sync now" from a client will call
  async syncNow(portal: string, account = 'shared') {
    const job = { portal, account };
    await this.queue.add('poll', job, {
      deduplication: { id: connectionKey(job) },
    });
  }

  async onApplicationBootstrap() {
    await this.schedulePolls();
    // push connectors hold connections, so only one instance runs them
    if (this.config.runConnectors) this.startPushes();
  }

  async onModuleDestroy() {
    for (const connector of this.started.splice(0))
      await Promise.resolve(connector.stop()).catch((err: Error) =>
        this.logger.error('stopping a connector failed', err.stack),
      );
  }

  async schedulePolls() {
    const wanted = new Set<string>();
    for (const { mode, options } of this.registry.connectors) {
      if (mode !== 'poll') continue;
      for (const account of this.accounts(options.portal)) {
        const job = { portal: options.portal, account };
        wanted.add(connectionKey(job));
        await this.queue.upsertJobScheduler(
          connectionKey(job),
          { pattern: options.schedule },
          { name: 'tick', data: job },
        );
      }
    }
    // a turned-off connector's schedule would keep firing otherwise
    for (const scheduler of await this.queue.getJobSchedulers())
      if (!wanted.has(scheduler.key))
        await this.queue.removeJobScheduler(scheduler.key);
  }

  private startPushes() {
    for (const connector of this.registry.connectors) {
      if (connector.mode !== 'push') continue;
      const { portal } = connector.options;
      for (const account of this.accounts(portal)) {
        const { instance } = connector;
        this.started.push(instance);
        // not awaited: a slow or broken connector mustn't hold up the app
        Promise.resolve()
          .then(() => instance.start(this.context(portal, account)))
          .catch((err: Error) =>
            this.logger.error(`connector ${portal} failed to start`, err.stack),
          );
      }
    }
  }
}
