import { Query } from '@nestjs/cqrs';
import type { File } from '../../domain/file.js';

export class GetFileQuery extends Query<File | null> {
  constructor(public readonly id: string) {
    super();
  }
}
