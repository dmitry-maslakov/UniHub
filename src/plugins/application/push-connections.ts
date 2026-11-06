import { setTimeout } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Timeout } from '@nestjs/schedule';
import type { PushesFromPortal } from '@app/plugin-sdk';
import type { Connection } from '../../ingest/contracts.js';
import { pluginsConfig } from '../plugins.config.js';
import { ConnectionDirectory } from './connection-directory.js';
import { ConnectorRuns, type RunOutcome } from './connector-runs.js';
import { PluginCatalog } from './plugin-catalog.js';

const FIRST_RESTART_MS = 1_000;

interface Running {
  controller: AbortController;
  done: Promise<void>;
}

// Push connectors keep their connections, so one process runs them: they
// start with the scheduler, once the app is up, so only where the background
// work runs, and of several such processes in the one with RUN_CONNECTORS.
// Each connection gets a run of its own. A run that ends or fails is started
// again, a little later each time it ends soon again; at shutdown they're
// all stopped at once, each given its time.
@Injectable()
export class PushConnections implements OnModuleDestroy {
  private readonly logger = new Logger(PushConnections.name);
  private readonly running = new Map<string, Running>();

  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
    private readonly runs: ConnectorRuns,
  ) {}

  @Timeout('push-connections', 0)
  start() {
    if (!this.config.runConnectors) return;
    for (const { spec, instance } of this.catalog.pushConnectors)
      for (const connection of this.directory.connections(spec.portal)) {
        const controller = new AbortController();
        // not awaited: a slow or broken connector mustn't hold up the app
        const done = this.keepRunning(instance, connection, controller.signal);
        this.running.set(connection.key, { controller, done });
      }
  }

  async onModuleDestroy() {
    const running = [...this.running];
    this.running.clear();
    await Promise.all(running.map(([key, run]) => this.stop(key, run)));
  }

  private async keepRunning(
    connector: PushesFromPortal,
    connection: Connection,
    signal: AbortSignal,
  ) {
    // counts the runs in a row that ended soon: one that stayed up past the
    // longest wait was a working connection, so it starts over at a second
    for (let failing = 0; !signal.aborted; failing++) {
      const started = Date.now();
      let outcome: RunOutcome = 'ended';
      try {
        await connector.run(this.directory.context(connection, signal));
      } catch (err) {
        outcome = 'failed';
        if (!signal.aborted)
          this.logger.error(`${connection.key} failed`, (err as Error).stack);
      }
      if (signal.aborted) return;
      this.runs.ended(connection.portal, outcome);
      if (Date.now() - started > this.config.restartMaxMs) failing = 0;
      const wait = Math.min(
        FIRST_RESTART_MS * 2 ** failing,
        this.config.restartMaxMs,
      );
      this.logger.warn(
        `${connection.key} ended, running it again in ${wait} ms`,
      );
      // rejects when stopped meanwhile, and the loop ends
      await setTimeout(wait, undefined, { signal }).catch(() => {});
    }
  }

  private async stop(key: string, { controller, done }: Running) {
    controller.abort();
    // unref'd: a connector that never stops mustn't keep the process alive
    const stopped = await Promise.race([
      done.then(() => true),
      setTimeout(this.config.stopTimeoutMs, false, { ref: false }),
    ]);
    if (!stopped)
      this.logger.error(
        `${key} didn't stop within ${this.config.stopTimeoutMs} ms`,
      );
  }
}
