import { Command } from '@nestjs/cqrs';
import type { Upserted } from '../../domain/changes.js';
import type { File, FileData } from '../../domain/file.js';

export class UpsertFileCommand extends Command<Upserted<File>> {
  constructor(public readonly data: FileData) {
    super();
  }
}
