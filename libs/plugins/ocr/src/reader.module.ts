import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { readerConfig } from './models.config.js';
import { ReaderProcessor } from './models.processors.js';

@Module({
  imports: [ConfigModule.forFeature(readerConfig)],
  providers: [ReaderProcessor],
})
export class ReaderModule {}
