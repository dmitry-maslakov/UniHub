import { Injectable } from '@nestjs/common';
import {
  NonRetryableMessageError,
  OutboxTransport,
  type OutboxMessage,
} from '@nestjs/outbox';
import { Dispatch } from '../application/dispatch.js';
import { PluginJobQueue } from '../application/ports.js';
import { toSdkMessage } from '../application/to-sdk-message.js';

// Publishes an outbox message as the plugin jobs it makes. Their ids come
// from the work, so a message the relay publishes again, after a publish
// that failed partway too, queues only what's missing.
@Injectable()
export class PluginsOutboxTransport extends OutboxTransport {
  constructor(
    private readonly dispatch: Dispatch,
    private readonly queue: PluginJobQueue,
  ) {
    super();
  }

  async publish({ id, topic, payload }: OutboxMessage) {
    const message = toSdkMessage(topic, payload);
    // a topic nobody maps is a bug, not an outage: dead-lettered (and logged)
    // at once instead of retried
    if (!message)
      throw new NonRetryableMessageError(`no plugin message for ${topic}`);
    await this.queue.enqueue(await this.dispatch.jobsFor(id, message));
  }
}
