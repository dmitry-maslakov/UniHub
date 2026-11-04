import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PortalId } from '@app/kernel';
import { PluginCatalog } from './application/plugin-catalog.js';
import { ConnectorHost } from './connector-host.js';
import { CONNECTORS_QUEUE, type ConnectorJob } from './connectors.queue.js';

@Processor(CONNECTORS_QUEUE, { concurrency: 4 })
export class ConnectorsWorker extends WorkerHost {
  private readonly logger = new Logger(ConnectorsWorker.name);

  constructor(
    private readonly host: ConnectorHost,
    private readonly catalog: PluginCatalog,
  ) {
    super();
  }

  async process(job: Job<ConnectorJob>) {
    const { portal, account } = job.data;
    if (job.name === 'tick') return this.host.syncNow(portal, account);

    const connector = this.catalog.pollConnector(PortalId.parse(portal));
    // turned off since the job was queued
    if (!connector) return;
    await connector.instance.poll(this.host.context(portal, account));
  }

  @OnWorkerEvent('failed')
  failed(job: Job<ConnectorJob> | undefined, error: Error) {
    if (job?.name === 'poll')
      this.logger.error(`${job.data.portal} poll failed`, error.stack);
  }
}
