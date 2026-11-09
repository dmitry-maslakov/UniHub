import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ocrConfig } from './ocr.config.js';
import { OcrProcessor } from './ocr.processor.js';
import { Tesseract } from './tesseract.js';

@Module({
  imports: [ConfigModule.forFeature(ocrConfig)],
  providers: [Tesseract, OcrProcessor],
})
export class OcrModule {}
