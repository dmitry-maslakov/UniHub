import { Module } from '@nestjs/common';
import { ArchivesExpander } from './archives.expander.js';

@Module({
  providers: [ArchivesExpander],
})
export class ArchivesModule {}
