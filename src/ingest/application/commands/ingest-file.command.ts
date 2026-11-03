import { Command } from '@nestjs/cqrs';
import type { FileRecord } from '@app/plugin-sdk';

export class IngestFileCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly portal: string,
    public readonly record: FileRecord,
  ) {
    super();
  }
}
