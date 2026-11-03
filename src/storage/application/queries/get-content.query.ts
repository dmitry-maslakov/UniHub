import type { Readable } from 'node:stream';
import { Query } from '@nestjs/cqrs';

export class GetContentQuery extends Query<Readable> {
  constructor(public readonly hash: string) {
    super();
  }
}
