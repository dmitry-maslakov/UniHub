import { Command } from '@nestjs/cqrs';

// `course` and `item` are the portal's ids, not ours
export interface FileInput {
  portal: string;
  externalId: string;
  course: string | null;
  item: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: string | null;
  sourceUpdatedAt: Date | null;
}

export class UpsertFileCommand extends Command<{
  id: string;
  changed: boolean;
  // no content yet, or the portal changed the file since it was stored
  needsContent: boolean;
}> {
  constructor(public readonly data: FileInput) {
    super();
  }
}
