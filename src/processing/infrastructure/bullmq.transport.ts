import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { InjectQueue } from '@nestjs/bullmq';
import { OutboxTransport, type OutboxMessage } from '@nestjs/outbox';
import type { Queue } from 'bullmq';
import { FILE_CONTENT_STORED, type Message } from '@app/plugin-sdk';
import { GetFileQuery } from '../../catalog/contracts.js';
import { PluginRegistry } from '../../plugins/plugin-registry.js';
import { toSdkMessage } from '../application/to-sdk-message.js';
import { PLUGINS_QUEUE, type PluginJob } from '../queues.js';

// Publishes outbox messages as one queue job per interested plugin, all in one
// addBulk (all or none). The job id is message id + plugin, so a message the
// relay publishes again doesn't queue anything twice.
@Injectable()
export class BullMqTransport extends OutboxTransport {
  constructor(
    @InjectQueue(PLUGINS_QUEUE) private readonly queue: Queue<PluginJob>,
    private readonly registry: PluginRegistry,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  async publish(outboxMessage: OutboxMessage) {
    const message = toSdkMessage(outboxMessage.topic, outboxMessage.payload);
    if (!message) return;

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
    const names = this.registry
      .aggregatorsFor(message.topic)
      .map((a) => a.options.name);
    if (message.topic === FILE_CONTENT_STORED) {
      const file = await this.queries.execute(
        new GetFileQuery(message.payload.fileId),
      );
      if (file)
        names.unshift(
          ...this.registry.processorsFor(file).map((p) => p.options.name),
        );
    }
    return names;
  }
}
