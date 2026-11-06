import { once } from 'node:events';
import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Connection } from '../../ingest/contracts.js';
import { roleConfig } from '../../platform/role/role.config.js';
import { ConnectionDirectory } from '../application/connection-directory.js';
import { ConnectorRuns } from '../application/connector-runs.js';
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
// takes three arguments), aborted past CONNECTOR_POLL_TIMEOUT_MINUTES and at
// shutdown too. A poll job answers whether it polled.
@Processor(CONNECTORS_QUEUE, { concurrency: 4 })
export class ConnectorsWorker extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectorsWorker.name);
  private readonly shutdown = new AbortController();

  constructor(
    private readonly catalog: PluginCatalog,
    private readonly directory: ConnectionDirectory,
    private readonly schedules: ConnectorSchedules,
    @Inject(pluginsConfig.KEY)
    private readonly config: ConfigType<typeof pluginsConfig>,
    @Inject(roleConfig.KEY)
    private readonly role: ConfigType<typeof roleConfig>,
    private readonly runs: ConnectorRuns,
  ) {
    super();
  }

  async process(job: Job<ConnectorJob>, _token?: string, signal?: AbortSignal) {
    const connection = Connection.of(job.data);
    if (job.name === TICK) return this.schedules.pollNow(connection);

    const connector = this.catalog.pollConnector(connection.portal);
    // turned off since the job was queued
    if (!connector) return false;
    const run = AbortSignal.any([
      AbortSignal.timeout(this.config.pollTimeoutMs),
      this.shutdown.signal,
      ...(signal ? [signal] : []),
    ]);
    const ctx = this.directory.context(connection, run);
    // let go of at the signal even when the connector doesn't listen to it,
    // so the job ends and the next tick can poll again. once()'s listener
    // holds the run till then: nothing else holds a poll that waits on
    // nothing (BullMQ keeps the promise of the run, not the job), so
    // aborted(run, job), which holds it only while the job is held, went at
    // a GC, the job left active for good
    const settled = new AbortController();
    try {
      if (!run.aborted)
        await Promise.race([
          connector.instance.poll(ctx),
          once(run, 'abort', { signal: settled.signal }),
        ]);
    } finally {
      settled.abort();
    }
    if (run.aborted) throw new Error(`poll stopped: ${String(run.reason)}`);
    return true;
  }

  // another instance may run the job now: this run stops rather than going
  // on alongside it
  @OnWorkerEvent('lockRenewalFailed')
  lockLost(jobIds: string[]) {
    for (const id of jobIds) this.worker.cancelJob(id, 'its lock was lost');
  }

  // A poll can stop anywhere, the next one goes on from the state it saved.
  // Closed here rather than when Nest closes the workers, after every
  // module's shutdown: until then it would go on taking polls. The running
  // ones are let go of at once, and so is one fetched meanwhile. An api
  // process registered no worker (APP_ROLE), so it has none to close.
  async onModuleDestroy() {
    this.shutdown.abort('the app is shutting down');
    if (this.role.worker) await this.worker.close();
  }

  // a poll that ran, not one whose connector was turned off meanwhile
  @OnWorkerEvent('completed')
  completed(job: Job<ConnectorJob>, polled: unknown) {
    if (job.name === POLL && polled === true)
      this.runs.ended(job.data.portal, 'succeeded');
  }

  // one stopped at shutdown isn't counted
  @OnWorkerEvent('failed')
  failed(job: Job<ConnectorJob> | undefined, error: Error) {
    if (job?.name !== POLL) return;
    this.logger.error(`${job.data.portal} poll failed`, error.stack);
    if (!this.shutdown.signal.aborted)
      this.runs.ended(job.data.portal, 'failed');
  }
}
