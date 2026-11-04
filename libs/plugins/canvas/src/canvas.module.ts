import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { canvasConfig } from './canvas.config.js';
import { CanvasConnector } from './canvas.connector.js';

@Module({
  imports: [ConfigModule.forFeature(canvasConfig)],
  providers: [CanvasConnector],
})
export class CanvasModule {}
