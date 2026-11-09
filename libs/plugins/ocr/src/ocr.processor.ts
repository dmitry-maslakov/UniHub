import { Worker } from 'node:worker_threads';
import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import {
  ContentProcessor,
  firstMessage,
  readUpTo,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { Deck, IMAGE_EXTENSIONS, MAX_PICTURE } from './deck.js';
import { pagePicture, preparePicture } from './picture.js';
import { Tesseract } from './tesseract.js';

const IMAGES = [
  ...IMAGE_EXTENSIONS,
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/tiff',
];
const PDF = ['.pdf', 'application/pdf'];
const DECK = [
  '.pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// a pdf or a deck past this isn't read
export const MAX_BYTES = 100 * 1024 * 1024;
// pages or slides read of one file, and the time they get; past either the
// rest are left empty
export const MAX_PAGES = 500;
export const DEADLINE_MS = 30 * 60_000;
const SCAN_TIMEOUT_MS = 2 * 60_000;
const PAGE_TIMEOUT_MS = 60_000;
const HEAP_MB = 512;

interface Scan {
  refused?: true;
  pages: number;
  textless: number[];
}
interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

// Text off pictures: images, the pages of a pdf with no text of their own
// and the pictures on a deck's slides with little, read by Tesseract. A part
// is a page or slide (empty where nothing was read), an image has one; a
// file with nothing read has none, which is stored like any result, so it
// isn't queued again.
//
// A file that can't be read is the file's fault, not a failed job (it would
// be tried again for ever): it's logged and gives what was read, if
// anything. The one failure is `tesseract` not being installed.
@ContentProcessor({
  name: 'ocr',
  version: 1,
  accepts: [...IMAGES, ...PDF, ...DECK],
})
@Injectable()
export class OcrProcessor implements ProcessesContent {
  private readonly logger = new Logger(OcrProcessor.name);
  // two files at a time, their pages one after another: two cores at most
  private readonly limit = pLimit(2);

  constructor(private readonly tesseract: Tesseract) {}

  process(input: ProcessorInput) {
    return this.limit(async () => {
      const read = DECK.includes(input.matched)
        ? this.deck(input)
        : PDF.includes(input.matched)
          ? this.pdf(input)
          : this.image(input);
      const parts = await read.catch((error: unknown) => {
        if (isMissing(error)) throw error;
        this.logger.warn(`${input.name} can't be read: ${message(error)}`);
        return [];
      });
      return { parts: parts.every((part) => part === '') ? [] : parts };
    });
  }

  private async image(input: ProcessorInput) {
    const data = await readUpTo(await input.content(), MAX_PICTURE);
    if (!data) throw new Error(`larger than ${MAX_PICTURE} bytes`);
    const picture = await preparePicture(data);
    return picture ? [await this.tesseract.read(picture)] : [];
  }

  private async pdf(input: ProcessorInput) {
    const data = await readUpTo(await input.content(), MAX_BYTES);
    if (!data) throw new Error(`larger than ${MAX_BYTES} bytes`);
    const scan = await firstMessage<Scan>(
      this.worker({ data, scan: true }),
      SCAN_TIMEOUT_MS,
    );
    if (scan.refused) throw new Error('not a PDF that can be opened');
    return this.pages(input, scan.pages, scan.textless, async (page) => {
      // a worker a page: its memory and its failure are the page's own
      const {
        width,
        height,
        data: raw,
      } = await firstMessage<Bitmap>(
        this.worker({ data, page }),
        PAGE_TIMEOUT_MS,
      );
      return this.tesseract.read(await pagePicture(raw, width, height));
    });
  }

  private async deck(input: ProcessorInput) {
    const data = await readUpTo(await input.content(), MAX_BYTES);
    if (!data) throw new Error(`larger than ${MAX_BYTES} bytes`);
    const deck = await Deck.open(data);
    try {
      const slides = await deck.slides();
      const pictures = new Map<number, string[]>();
      for (const [i, slide] of slides.entries()) {
        const found = await deck.pictures(slide).catch((error: unknown) => {
          this.logger.warn(
            `${input.name}: slide ${i + 1} can't be read: ${message(error)}`,
          );
          return [];
        });
        if (found.length > 0) pictures.set(i + 1, found);
      }
      return await this.pages(
        input,
        slides.length,
        [...pictures.keys()],
        async (slide) => {
          const texts: string[] = [];
          for (const entry of pictures.get(slide)!) {
            const bytes = await deck.picture(entry);
            const picture = bytes && (await preparePicture(bytes));
            if (picture) texts.push(await this.tesseract.read(picture));
          }
          return texts.filter(Boolean).join('\n\n');
        },
      );
    } finally {
      deck.close();
    }
  }

  // The parts of a file of `total` pages, those in `todo` read one after
  // another by `read`, in the time and the number there are for them. A page
  // that fails is empty.
  private async pages(
    input: ProcessorInput,
    total: number,
    todo: number[],
    read: (page: number) => Promise<string>,
  ) {
    const parts = Array<string>(total).fill('');
    const deadline = Date.now() + DEADLINE_MS;
    for (const [done, page] of todo.entries()) {
      if (done >= MAX_PAGES || Date.now() > deadline) {
        this.logger.warn(
          `${input.name}: ${todo.length - done} of ${todo.length} pages left unread`,
        );
        break;
      }
      try {
        parts[page - 1] = await read(page);
      } catch (error) {
        if (isMissing(error)) throw error;
        this.logger.warn(
          `${input.name}: page ${page} can't be read: ${message(error)}`,
        );
      }
    }
    return parts;
  }

  private worker(workerData: object) {
    return new Worker(new URL('./pdf.worker.ts', import.meta.url), {
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    });
  }
}

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
