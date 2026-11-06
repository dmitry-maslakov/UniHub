import { Injectable } from '@nestjs/common';
import { PluginCatalog } from '../../plugins/contracts.js';
import {
  fileKey,
  postKey,
  refId,
  treeKey,
  type RecordKey,
} from '../domain/records.js';
import {
  keyId,
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { UnpackingRepository } from '../domain/unpacking.js';
import { FileFacts, PostFacts, TextIndex, TextIndexQueue } from './ports.js';

// Puts the search index back in step with postgres: queues what it lacks
// of the processors on (a lost job, a deleted index) and what it holds that
// isn't newest (an older version, a newer one postgres lost, a text it no
// longer has), which the job replaces or takes out. A text of a processor
// turned off is left as it is: searches leave it out (SearchTexts), so one
// turned back on is found again at once; but one the index lacks waits for
// its processor, as no search could find it. The records likewise: each
// post, file with content and tree there is, if the index lacks it or holds
// it made from something else (a post edited, a file renamed: catalog tells
// nothing of a rename), and those it holds of none.
@Injectable()
export class ReconcileIndex {
  constructor(
    private readonly index: TextIndex,
    private readonly representations: RepresentationRepository,
    private readonly queue: TextIndexQueue,
    private readonly plugins: PluginCatalog,
    private readonly posts: PostFacts,
    private readonly files: FileFacts,
    private readonly unpackings: UnpackingRepository,
  ) {}

  // how many jobs it queued
  async run() {
    // asked every time, so a run brings back an index lost since the last
    await this.index.ensure();
    return (await this.texts()) + (await this.records());
  }

  private async texts() {
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

  private async records() {
    const indexed = new Map<string, RecordKey>();
    for await (const key of this.index.recordKeys())
      indexed.set(refId(key), key);
    let queued = 0;
    for await (const key of this.recordKeys()) {
      const had = indexed.get(refId(key));
      indexed.delete(refId(key));
      if (had?.fingerprint === key.fingerprint) continue;
      await this.queue.requeueRecord(key);
      queued++;
    }
    for (const key of indexed.values()) await this.queue.requeueRecord(key);
    return queued + indexed.size;
  }

  // every record there is, keyed as it would be indexed now
  private async *recordKeys() {
    for await (const { id, ...post } of this.posts.posts())
      yield postKey(id, post);
    for await (const { id, name, hash } of this.files.withContent())
      yield fileKey(id, { name, hash });
    for await (const tree of this.unpackings.trees()) yield treeKey(tree);
  }
}
