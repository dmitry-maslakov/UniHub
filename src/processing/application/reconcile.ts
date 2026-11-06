import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { RepresentationRepository } from '../domain/representation.js';
import { LIMITS } from '../domain/tree-budget.js';
import { isCurrent, kept, UnpackingRepository } from '../domain/unpacking.js';
import { Dispatch } from './dispatch.js';
import { FileFacts, PluginJobQueue } from './ports.js';

// Queues processing and unpacking that should exist but don't: a new
// plugin, a new version of one or of the hub's limits, a file renamed to a
// type it now takes, work lost with redis, a job that gave up. It walks
// files to their current trees and on to the members kept in them.
@Injectable()
export class Reconcile {
  constructor(
    private readonly files: FileFacts,
    private readonly dispatch: Dispatch,
    private readonly representations: RepresentationRepository,
    private readonly unpackings: UnpackingRepository,
    private readonly queue: PluginJobQueue,
  ) {}

  // how many jobs it queued
  async run() {
    let queued = 0;
    const missing = async (jobs: ReturnType<Dispatch['processing']>) => {
      for (const job of jobs) {
        if (await this.representations.exists(job.key)) continue;
        await this.queue.requeue(job);
        queued++;
      }
    };
    for await (const file of this.files.withContent()) {
      await missing(this.dispatch.processing(file));
      for (const job of this.dispatch.unpacking(file)) {
        const tree = await this.unpackings.current(file.hash);
        if (!tree || !isCurrent(tree, job.key, LIMITS.policy)) {
          await this.queue.requeue(job);
          queued++;
          continue;
        }
        for (const { path, mime, hash } of kept(tree.members))
          await missing(
            this.dispatch.processing({ name: basename(path), mime, hash }),
          );
      }
    }
    return queued;
  }
}
