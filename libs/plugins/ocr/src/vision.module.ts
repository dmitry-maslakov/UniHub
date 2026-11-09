import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { visionConfig } from './models.config.js';
import { VisionProcessor } from './models.processors.js';

@Module({
  imports: [ConfigModule.forFeature(visionConfig)],
  providers: [VisionProcessor],
})
export class VisionModule {}
