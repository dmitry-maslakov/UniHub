import { Query } from '@nestjs/cqrs';
import type { FileDto } from './dtos.js';

export class GetFileQuery extends Query<FileDto | null> {
  constructor(public readonly id: string) {
    super();
  }
}
