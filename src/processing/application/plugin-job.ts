import type { Message } from '@app/plugin-sdk';
import type { PluginName } from '@app/kernel';
import type { ExpansionKey } from '../domain/expansion.js';
import type { RepresentationKey } from '../domain/representation.js';

// What one queue job asks of one plugin, so a failing plugin only retries
// itself. An aggregator handles a message; a processor makes text of some
// content, an expander unpacks it into entries, whichever names it goes by.

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

export interface ExpandJob {
  kind: 'expand';
  key: ExpansionKey;
}

// what a content's name brings
export type ContentJob = ProcessJob | ExpandJob;

export type PluginJob = HandleJob | ContentJob;

export const pluginOf = (job: PluginJob) =>
  job.kind === 'handle'
    ? job.aggregator
    : job.kind === 'process'
      ? job.key.processor
      : job.key.expander;

// The same work has the same id: a message the relay publishes again, the
// same content under another name, work the reconciler queues too. Plugin
// names are unique across kinds, so a content's jobs can't share one.
export const jobId = (job: PluginJob) =>
  job.kind === 'handle'
    ? `${job.messageId}__${job.aggregator}`
    : `${job.key.hash}__${pluginOf(job)}__${job.key.version}`;
