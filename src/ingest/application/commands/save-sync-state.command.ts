import { Command } from '@nestjs/cqrs';
import type { Json } from '@app/plugin-sdk';

export class SaveSyncStateCommand extends Command<void> {
  constructor(
    public readonly portal: string,
    public readonly state: Json,
  ) {
    super();
  }
}
