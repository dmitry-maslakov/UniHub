import { Module } from '@nestjs/common';
import { PlainTextProcessor } from './plain-text.processor.js';

@Module({
  providers: [PlainTextProcessor],
})
export class PlainTextModule {}
