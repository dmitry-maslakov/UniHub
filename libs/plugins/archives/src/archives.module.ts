import { Module } from '@nestjs/common';
import { ArchivesUnpacker } from './archives.unpacker.js';

@Module({
  providers: [ArchivesUnpacker],
})
export class ArchivesModule {}
