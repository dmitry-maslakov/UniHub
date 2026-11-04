import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { again, once } from '../../../platform/queues/job-ids.js';
import { TextIndexQueue } from '../../application/ports.js';
import { keyId, type RepresentationKey } from '../../domain/representation.js';
import {
  INDEX,
  SEARCH_INDEX_QUEUE,
  type IndexJob,
} from './search-index.queue.js';

@Injectable()
export class BullmqTextIndexQueue extends TextIndexQueue {
  constructor(
    @InjectQueue(SEARCH_INDEX_QUEUE) private readonly queue: Queue<IndexJob>,
  ) {
    super();
  }

  async enqueue(key: RepresentationKey) {
    await this.queue.add(INDEX, { key }, once(keyId(key)));
  }

  async requeue(key: RepresentationKey) {
    await this.queue.add(INDEX, { key }, again(keyId(key)));
  }
}
