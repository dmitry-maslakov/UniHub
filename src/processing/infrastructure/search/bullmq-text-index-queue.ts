import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { TextIndexQueue } from '../../application/ports.js';
import { keyId, type RepresentationKey } from '../../domain/representation.js';
import {
  INDEX,
  SEARCH_INDEX_QUEUE,
  type IndexJob,
} from './search-index.queue.js';

// Ids as BullmqPluginJobQueue gives them: enqueue sets the job's own id and
// its deduplication id, requeue only the deduplication one.
@Injectable()
export class BullmqTextIndexQueue extends TextIndexQueue {
  constructor(
    @InjectQueue(SEARCH_INDEX_QUEUE) private readonly queue: Queue<IndexJob>,
  ) {
    super();
  }

  async enqueue(key: RepresentationKey) {
    const id = keyId(key);
    await this.queue.add(INDEX, { key }, { jobId: id, deduplication: { id } });
  }

  async requeue(key: RepresentationKey) {
    await this.queue.add(INDEX, { key }, { deduplication: { id: keyId(key) } });
  }
}
