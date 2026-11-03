import { Command } from '@nestjs/cqrs';

// by the portal's id; removing something unknown or already removed is a no-op
export class RemoveItemCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly portal: string,
    public readonly externalId: string,
  ) {
    super();
  }
}
