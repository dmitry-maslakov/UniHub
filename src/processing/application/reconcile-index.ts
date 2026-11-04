import { Injectable } from '@nestjs/common';
import {
  keyId,
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { TextIndex, TextIndexQueue } from './ports.js';

// Puts the search index back in step with postgres: queues what it lacks
// (a lost job, a deleted index) and what it holds that isn't newest (an
// older version, a newer one postgres lost, a text it no longer has), which
// the job replaces or takes out.
@Injectable()
export class ReconcileIndex {
  constructor(
    private readonly index: TextIndex,
    private readonly representations: RepresentationRepository,
    private readonly queue: TextIndexQueue,
  ) {}

  // how many jobs it queued
  async run() {
    // asked every time, so a run brings back an index lost since the last
    await this.index.ensure();
    const indexed = new Map<string, RepresentationKey>();
    for await (const key of this.index.keys()) indexed.set(keyId(key), key);
    let queued = 0;
    for await (const key of this.representations.newestKeys()) {
      if (indexed.delete(keyId(key))) continue;
      await this.queue.requeue(key);
      queued++;
    }
    for (const key of indexed.values()) await this.queue.requeue(key);
    return queued + indexed.size;
  }
}
