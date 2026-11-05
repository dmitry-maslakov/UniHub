import { Module } from '@nestjs/common';
import { ArchiveTextProcessor } from './archive-text.processor.js';
import { PlainTextProcessor } from './plain-text.processor.js';

// text files, and the text files in archives
@Module({
  providers: [PlainTextProcessor, ArchiveTextProcessor],
})
export class PlainTextModule {}
