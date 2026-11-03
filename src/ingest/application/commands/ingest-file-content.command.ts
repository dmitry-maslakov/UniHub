import type { Readable } from 'node:stream';
import { Command } from '@nestjs/cqrs';

// content of a file the plugin has already sent with IngestFileCommand
export class IngestFileContentCommand extends Command<{
  hash: string;
  changed: boolean;
}> {
  constructor(
    public readonly portal: string,
    public readonly externalId: string,
    public readonly content: Readable,
  ) {
    super();
  }
}
