import { Injectable } from '@nestjs/common';
import { RepresentationRepository } from '../domain/representation.js';
import { Dispatch } from './dispatch.js';
import { FileFacts, PluginJobQueue } from './ports.js';

// Queues processing that should exist but doesn't: a new processor, a new
// version of one, a file renamed to a type it now accepts, work lost with
// redis, a job that gave up.
@Injectable()
export class Reconcile {
  constructor(
    private readonly files: FileFacts,
    private readonly dispatch: Dispatch,
    private readonly representations: RepresentationRepository,
    private readonly queue: PluginJobQueue,
  ) {}

  // how many jobs it queued
  async run() {
    let queued = 0;
    for await (const file of this.files.withContent())
      for (const job of this.dispatch.processing(file)) {
        if (await this.representations.exists(job.key)) continue;
        await this.queue.requeue(job);
        queued++;
      }
    return queued;
  }
}
