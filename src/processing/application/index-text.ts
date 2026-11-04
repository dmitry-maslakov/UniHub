import { Injectable } from '@nestjs/common';
import { chunksOf } from '../domain/chunks.js';
import {
  RepresentationRepository,
  type RepresentationKey,
} from '../domain/representation.js';
import { TextIndex } from './ports.js';

// Puts the newest text a processor made of some content into the search
// index, or takes it out once there's none. Whichever version a job names,
// the newest is indexed, so a job for an older one is harmless.
@Injectable()
export class IndexText {
  constructor(
    private readonly representations: RepresentationRepository,
    private readonly index: TextIndex,
  ) {}

  async run({ hash, processor }: RepresentationKey) {
    const newest = await this.representations.newest(hash, processor);
    if (!newest) return this.index.remove({ hash, processor });
    const { parts, ...key } = newest;
    await this.index.put(key, chunksOf(parts));
  }
}
