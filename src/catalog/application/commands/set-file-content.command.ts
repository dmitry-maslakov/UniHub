import { Command } from '@nestjs/cqrs';

export class SetFileContentCommand extends Command<{ changed: boolean }> {
  constructor(
    public readonly fileId: string,
    public readonly hash: string,
  ) {
    super();
  }
}
