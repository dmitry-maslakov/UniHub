import { Query } from '@nestjs/cqrs';
import type { FileDto } from './file.dto.js';

// by the portal's id
export class FindFileQuery extends Query<FileDto | null> {
  constructor(
    public readonly portal: string,
    public readonly externalId: string,
  ) {
    super();
  }
}
