import { Injectable } from '@nestjs/common';
import { PluginCatalog } from '../../plugins/contracts.js';
import {
  keyId,
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { TextIndex, TextIndexQueue } from './ports.js';

// Puts the search index back in step with postgres: queues what it lacks
// of the processors on (a lost job, a deleted index) and what it holds that
// isn't newest (an older version, a newer one postgres lost, a text it no
// longer has), which the job replaces or takes out. A text of a processor
// turned off is left as it is: searches leave it out (SearchTexts), so one
// turned back on is found again at once; but one the index lacks waits for
// its processor, as no search could find it.
@Injectable()
export class ReconcileIndex {
  constructor(
    private readonly index: TextIndex,
    private readonly representations: RepresentationRepository,
    private readonly queue: TextIndexQueue,
    private readonly plugins: PluginCatalog,
  ) {}

  // how many jobs it queued
  async run() {
    // asked every time, so a run brings back an index lost since the last
    await this.index.ensure();
    const indexed = new Map<string, RepresentationKey>();
    for await (const key of this.index.keys()) indexed.set(keyId(key), key);
    const on = new Set(this.plugins.processorNames);
    let queued = 0;
    for await (const key of this.representations.newestKeys()) {
      if (indexed.delete(keyId(key)) || !on.has(key.processor)) continue;
      await this.queue.requeue(key);
      queued++;
    }
    for (const key of indexed.values()) await this.queue.requeue(key);
    return queued + indexed.size;
  }
}
