import { Injectable } from '@nestjs/common';
import pLimit from 'p-limit';
import { ContentProcessor, type ProcessorInput } from '@app/plugin-sdk';
import { pagePicture, preparePicture } from './picture.js';
import { DECK, IMAGES, MAX_BYTES, PDF, PictureWalk } from './picture-walk.js';
import { Tesseract } from './tesseract.js';

export { MAX_BYTES };
// pages or slides read of one file, and the time they get; past either the
// rest are left empty
export const MAX_PAGES = 500;
export const DEADLINE_MS = 30 * 60_000;

// Text off pictures read by Tesseract (PictureWalk says what is read). What
// fails the job is ours: `tesseract` or one of its languages not being
// installed.
@ContentProcessor({
  name: 'ocr',
  version: 1,
  accepts: [...IMAGES, ...PDF, ...DECK],
})
@Injectable()
export class OcrProcessor extends PictureWalk {
  protected readonly limits = { maxPages: MAX_PAGES, deadlineMs: DEADLINE_MS };
  // two files at a time, their pages one after another: two cores at most
  private readonly limit = pLimit(2);

  constructor(private readonly tesseract: Tesseract) {
    super();
  }

  process(input: ProcessorInput) {
    return this.limit(async () => {
      // before any read: a missing binary or language fails the job
      await this.tesseract.ready();
      return this.walk(input);
    });
  }

  protected prepare(data: Buffer) {
    return preparePicture(data);
  }

  protected preparePage(raw: Uint8Array, width: number, height: number) {
    return pagePicture(raw, width, height);
  }

  protected read(picture: Buffer) {
    return this.tesseract.read(picture);
  }
}
