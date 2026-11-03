import { Command } from '@nestjs/cqrs';

export class SetFileContentCommand extends Command<{
  fileId: string;
  changed: boolean;
}> {
  constructor(
    public readonly portal: string,
    public readonly externalId: string,
    public readonly hash: string,
  ) {
    super();
  }
}
