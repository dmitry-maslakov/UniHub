import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ContentProcessor,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { ask, type Question } from './model.js';
import { readerConfig, visionConfig } from './models.config.js';
import { modelPage, modelPicture } from './picture.js';
import { DECK, IMAGES, PDF, PictureWalk } from './picture-walk.js';

// pages or slides of one file a model gets, and the time they get
export const MODEL_MAX_PAGES = 200;
export const MODEL_DEADLINE_MS = 170 * 60_000;
const TIMEOUT_MINUTES = 180;

const ACCEPTS = [...IMAGES, ...PDF, ...DECK];

// What the two model processors share: the pictures are read exactly as
// `ocr` reads them (README, OCR), but each is shown to a model on a server of
// its own, one after another: the queue runs one job at a time.
abstract class ModelWalk extends PictureWalk implements ProcessesContent {
  protected readonly limits = {
    maxPages: MODEL_MAX_PAGES,
    deadlineMs: MODEL_DEADLINE_MS,
  };
  protected abstract readonly url: string;
  protected abstract readonly question: Question;

  process(input: ProcessorInput) {
    return this.walk(input);
  }

  protected prepare(data: Buffer) {
    return modelPicture(data);
  }

  protected preparePage(raw: Uint8Array, width: number, height: number) {
    return modelPage(raw, width, height);
  }

  protected read(picture: Buffer, input: ProcessorInput) {
    return ask(this.url, this.question, picture, input, this.logger);
  }
}

// The text on a page, read by a page-reading model.
@ContentProcessor({
  name: 'reader',
  version: 1,
  accepts: ACCEPTS,
  heavy: { timeoutMinutes: TIMEOUT_MINUTES },
})
@Injectable()
export class ReaderProcessor extends ModelWalk {
  protected readonly question = {
    prompt: 'OCR:',
    imageFirst: true,
    maxTokens: 1500,
  };
  protected readonly url: string;

  constructor(
    @Inject(readerConfig.KEY) config: ConfigType<typeof readerConfig>,
  ) {
    super();
    this.url = config.url;
  }
}

// What a picture shows, said by an image-describing model.
@ContentProcessor({
  name: 'vision',
  version: 1,
  accepts: ACCEPTS,
  heavy: { timeoutMinutes: TIMEOUT_MINUTES },
})
@Injectable()
export class VisionProcessor extends ModelWalk {
  protected readonly question = {
    prompt:
      'Describe what this picture shows, in English, in two sentences. Transcribe any formula as LaTeX. If there is no formula, say nothing about formulas.',
    imageFirst: false,
    maxTokens: 300,
  };
  protected readonly url: string;

  constructor(
    @Inject(visionConfig.KEY) config: ConfigType<typeof visionConfig>,
  ) {
    super();
    this.url = config.url;
  }
}
