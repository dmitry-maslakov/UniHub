import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectQueue } from '@nestjs/bullmq';
import {
  NonRetryableMessageError,
  OutboxTransport,
  type OutboxMessage,
} from '@nestjs/outbox';
import type { Queue } from 'bullmq';
import { FILE_CONTENT_STORED, type Message } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginCatalog } from '../../plugins/contracts.js';
import { toSdkMessage } from '../application/to-sdk-message.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

// Publishes outbox messages as one queue job per interested plugin, all in one
// addBulk (all or none). The job id is message id + plugin, so a message the
// relay publishes again doesn't queue anything twice.
@Injectable()
export class PluginsOutboxTransport extends OutboxTransport {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
    private readonly plugins: PluginCatalog,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  async publish(outboxMessage: OutboxMessage) {
    const message = toSdkMessage(outboxMessage.topic, outboxMessage.payload);
    // a topic nobody maps is a bug, not an outage: dead-lettered (and logged)
    // at once instead of retried
    if (!message)
      throw new NonRetryableMessageError(
        `no plugin message for ${outboxMessage.topic}`,
      );

    const plugins = await this.targets(message);
    if (!plugins.length) return;

    await this.queue.addBulk(
      plugins.map((plugin) => ({
        name: plugin,
        data: { plugin, message },
        opts: { jobId: `${outboxMessage.id}__${plugin}` },
      })),
    );
  }

  private async targets(message: Message) {
    const names = this.plugins
      .aggregatorsFor(message.topic)
      .map((a) => a.spec.name);
    if (message.topic === FILE_CONTENT_STORED) {
      const file = await this.queries.execute(
        new GetFileQuery(message.payload.fileId),
      );
      if (file)
        names.unshift(
          ...this.plugins
            .processorsFor(file)
            .map(({ processor }) => processor.spec.name),
        );
    }
    return names;
  }
}
