import { Command } from '@nestjs/cqrs';
import type { FileData } from '../../domain/file.js';

// `course` and `item` are the portal's ids, not ours
export type FileInput = Omit<FileData, 'portalCourseId' | 'itemId'> & {
  course: string | null;
  item: string | null;
};

export class UpsertFileCommand extends Command<{
  id: string;
  changed: boolean;
  // no content yet, or the portal says the content changed
  needsContent: boolean;
}> {
  constructor(public readonly data: FileInput) {
    super();
  }
}
