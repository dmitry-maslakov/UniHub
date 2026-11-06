import type { Message } from '@app/plugin-sdk';
import type { PluginName } from '@app/kernel';
import type { RepresentationKey } from '../domain/representation.js';
import type { UnpackingKey } from '../domain/unpacking.js';

// What one queue job asks of one plugin, so a failing plugin only retries
// itself. An aggregator handles a message; a processor makes text of some
// content, an unpacker lists a container's members, whichever files hold it.

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

export interface UnpackJob {
  kind: 'unpack';
  key: UnpackingKey;
  // the hub's limits it was queued under (LIMITS.policy)
  policy: number;
}

export type PluginJob = HandleJob | ProcessJob | UnpackJob;

export const pluginOf = (job: PluginJob) =>
  job.kind === 'handle'
    ? job.aggregator
    : job.kind === 'process'
      ? job.key.processor
      : job.key.unpacker;

// The same work has the same id: a message the relay publishes again, the
// same content in another file, work the reconciler queues too. Plugin names
// are unique across kinds, so a content's jobs can't share one.
export const jobId = (job: PluginJob) =>
  job.kind === 'handle'
    ? `${job.messageId}__${job.aggregator}`
    : job.kind === 'process'
      ? `${job.key.hash}__${job.key.processor}__${job.key.version}`
      : `${job.key.hash}__${job.key.unpacker}__${job.key.version}__${job.policy}`;
