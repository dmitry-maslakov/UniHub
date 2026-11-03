import { Query } from '@nestjs/cqrs';
import type { Json } from '@app/plugin-sdk';

export class GetSyncStateQuery extends Query<Json | null> {
  constructor(public readonly portal: string) {
    super();
  }
}
