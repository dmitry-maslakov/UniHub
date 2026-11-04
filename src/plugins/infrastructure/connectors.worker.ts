import { aborted } from 'node:util';
import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Connection } from '../../ingest/contracts.js';
import { ConnectionDirectory } from '../application/connection-directory.js';
import { ConnectorSchedules } from '../application/connector-schedules.js';
import { PluginCatalog } from '../application/plugin-catalog.js';
import { pluginsConfig } from '../plugins.config.js';
import {
  CONNECTORS_QUEUE,
  POLL,
  TICK,
  type ConnectorJob,
} from './connectors.queue.js';

// A poll gets the job's abort signal (BullMQ hands it to a processor that
// takes three arguments), aborted past CONNECTOR_POLL_TIMEOUT_MINUTES too.
@Processor(CONNECTORS_QUEUE, { concurrency: 4 })
export class ConnectorsWorker extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectorsWorker.name);

  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    private readonly schedules: ConnectorSchedules,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
  ) {
    super();
  }

  async process(job: Job<ConnectorJob>, _token?: string, signal?: AbortSignal) {
    const connection = Connection.of(job.data);
    if (job.name === TICK) return this.schedules.pollNow(connection);

    const connector = this.catalog.pollConnector(connection.portal);
    // turned off since the job was queued
    if (!connector) return;
    const timeout = AbortSignal.timeout(this.config.pollTimeoutMs);
    const run = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const ctx = this.directory.context(connection, run);
    // let go of at the signal even when the connector doesn't listen to it,
    // so the job ends and the next tick can poll again (aborted() holds the
    // job weakly, and BullMQ holds it while it runs)
    await Promise.race([connector.instance.poll(ctx), aborted(run, job)]);
    if (run.aborted) throw new Error(`poll stopped: ${String(run.reason)}`);
  }

  // another instance may run the job now: this run stops rather than going
  // on alongside it
  @OnWorkerEvent('lockRenewalFailed')
  lockLost(jobIds: string[]) {
    for (const id of jobIds) this.worker.cancelJob(id, 'its lock was lost');
  }

  // a poll can stop anywhere, the next one goes on from the state it saved
  onModuleDestroy() {
    this.worker.cancelAllJobs('the app is shutting down');
  }

  @OnWorkerEvent('failed')
  failed(job: Job<ConnectorJob> | undefined, error: Error) {
    if (job?.name === POLL)
      this.logger.error(`${job.data.portal} poll failed`, error.stack);
  }
}
