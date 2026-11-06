import { Injectable } from '@nestjs/common';
import { ExpansionRepository } from '../domain/expansion.js';
import { RepresentationRepository } from '../domain/representation.js';
import { ContentNames } from './content-names.js';
import { Dispatch } from './dispatch.js';
import type { ContentJob } from './plugin-job.js';
import { PluginJobQueue } from './ports.js';

// Queues processing and expansions that should exist but don't: a new
// plugin, a new version of one, a file renamed to a type it now takes, work
// lost with redis, a job that gave up; an archive's entries once it's
// expanded.
@Injectable()
export class Reconcile {
  constructor(
    private readonly names: ContentNames,
    private readonly dispatch: Dispatch,
    private readonly representations: RepresentationRepository,
    private readonly expansions: ExpansionRepository,
    private readonly queue: PluginJobQueue,
  ) {}

  // how many jobs it queued
  async run() {
    let queued = 0;
    for await (const named of this.names.all())
      for (const job of this.dispatch.jobs(named)) {
        if (await this.done(job)) continue;
        await this.queue.requeue(job);
        queued++;
      }
    return queued;
  }

  private done(job: ContentJob) {
    return job.kind === 'process'
      ? this.representations.exists(job.key)
      : this.expansions.exists(job.key);
  }
}
