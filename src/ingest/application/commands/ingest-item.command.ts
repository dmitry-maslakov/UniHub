import { Command } from '@nestjs/cqrs';
import type { ItemRecord } from '@app/plugin-sdk';

export class IngestItemCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly portal: string,
    public readonly record: ItemRecord,
  ) {
    super();
  }
}
