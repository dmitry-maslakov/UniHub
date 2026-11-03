import { Command } from '@nestjs/cqrs';
import type { Upserted } from '../../domain/changes.js';
import type { File, FileData } from '../../domain/file.js';

// `course` and `item` are the portal's ids, not ours
export type FileInput = Omit<FileData, 'portalCourseId' | 'itemId'> & {
  course?: string;
  item?: string;
};

export class UpsertFileCommand extends Command<Upserted<File>> {
  constructor(public readonly data: FileInput) {
    super();
  }
}
