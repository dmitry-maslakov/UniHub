import type { Message } from '@app/plugin-sdk';
import type { PluginName } from '@app/kernel';
import type { RepresentationKey } from '../domain/representation.js';

// What one queue job asks of one plugin, so a failing plugin only retries
// itself. An aggregator handles a message; a processor makes text of some
// content, whichever files hold it.

export interface HandleJob {
  kind: 'handle';
  messageId: string;
  aggregator: PluginName;
  message: Message;
}

export interface ProcessJob {
  kind: 'process';
  key: RepresentationKey;
}

export type PluginJob = HandleJob | ProcessJob;

export const pluginOf = (job: PluginJob) =>
  job.kind === 'handle' ? job.aggregator : job.key.processor;

// The same work has the same id: a message the relay publishes again, the
// same content in another file, processing the reconciler queues too.
export const jobId = (job: PluginJob) =>
  job.kind === 'handle'
    ? `${job.messageId}__${job.aggregator}`
    : `${job.key.hash}__${job.key.processor}__${job.key.version}`;
