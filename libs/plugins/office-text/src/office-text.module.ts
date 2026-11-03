import { Module } from '@nestjs/common';
import { OfficeTextProcessor } from './office-text.processor.js';

@Module({
  providers: [OfficeTextProcessor],
})
export class OfficeTextModule {}
