import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Connection } from '../../ingest/contracts.js';
import {
  ConnectorSchedules,
  type Schedule,
} from '../application/connector-schedules.js';
import {
  CONNECTORS_QUEUE,
  POLL,
  TICK,
  jobOf,
  type ConnectorJob,
} from './connectors.queue.js';

@Injectable()
export class BullmqConnectorSchedules extends ConnectorSchedules {
  constructor(
    @InjectQueue(CONNECTORS_QUEUE) private readonly queue: Queue<ConnectorJob>,
  ) {
    super();
  }

  async set({ connection, pattern }: Schedule) {
    await this.queue.upsertJobScheduler(
      connection.key,
      { pattern },
      { name: TICK, data: jobOf(connection) },
    );
  }

  async keepOnly(connections: readonly Connection[]) {
    const wanted = new Set(connections.map((c) => c.key));
    for (const { key } of await this.queue.getJobSchedulers())
      if (!wanted.has(key)) await this.queue.removeJobScheduler(key);
  }

  async pollNow(connection: Connection) {
    await this.queue.add(POLL, jobOf(connection), {
      deduplication: { id: connection.key },
    });
  }
}
