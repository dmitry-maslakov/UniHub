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
import { IMAGE_EXTENSIONS, MAX_PICTURE, Pictures } from './deck.js';
import { pagePicture, preparePicture } from './picture.js';
import { Tesseract } from './tesseract.js';
import { fromWorker, Unreadable } from './unreadable.js';

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
const DECK_TIMEOUT_MS = 2 * 60_000;
const PAGE_TIMEOUT_MS = 60_000;
const HEAP_MB = 512;

interface Scan {
  refused?: true;
  pages: number;
  textless: number[];
}
interface DeckScan {
  refused?: true;
  slides: number;
  pictures: [number, string[]][];
  unreadable: number[];
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
// anything. What fails the job is ours: `tesseract` or one of its languages
// not being installed, a blob that can't be read, a worker that can't start.
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
      // before any read: a missing binary or language fails the job
      await this.tesseract.ready();
      const isImage =
        !DECK.includes(input.matched) && !PDF.includes(input.matched);
      const max = isImage ? MAX_PICTURE : MAX_BYTES;
      // reading the content is not the file's fault: an error fails the job
      const data = await readUpTo(await input.content(), max);
      let parts: string[] = [];
      try {
        if (!data) throw new Unreadable(`larger than ${max} bytes`);
        parts = DECK.includes(input.matched)
          ? await this.deck(input, data)
          : PDF.includes(input.matched)
            ? await this.pdf(input, data)
            : await this.image(data);
      } catch (error) {
        if (!(error instanceof Unreadable)) throw error;
        this.logger.warn(`${input.name} can't be read: ${error.message}`);
      }
      return { parts: parts.every((part) => part === '') ? [] : parts };
    });
  }

  private async image(data: Buffer) {
    const picture = await preparePicture(data);
    return picture ? [await this.tesseract.read(picture)] : [];
  }

  private async pdf(input: ProcessorInput, data: Buffer) {
    const scan = await fromWorker(
      firstMessage<Scan>(this.pdfWorker({ data, scan: true }), SCAN_TIMEOUT_MS),
    );
    return this.pages(input, scan.pages, scan.textless, async (page) => {
      // a worker a page: its memory and its failure are the page's own
      const {
        width,
        height,
        data: raw,
      } = await fromWorker(
        firstMessage<Bitmap>(this.pdfWorker({ data, page }), PAGE_TIMEOUT_MS),
      );
      return this.tesseract.read(await pagePicture(raw, width, height));
    });
  }

  private async deck(input: ProcessorInput, data: Buffer) {
    const scan = await fromWorker(
      firstMessage<DeckScan>(this.deckWorker({ data }), DECK_TIMEOUT_MS),
    );
    for (const slide of scan.unreadable)
      this.logger.warn(`${input.name}: slide ${slide} can't be read`);
    const pictures = new Map(scan.pictures);
    const deck = await Pictures.open(data);
    try {
      return await this.pages(
        input,
        scan.slides,
        [...pictures.keys()],
        async (slide, expired) => {
          const texts: string[] = [];
          for (const entry of pictures.get(slide)!) {
            if (expired()) break;
            // one bad picture is skipped, the slide keeps what was read
            try {
              const picture = await preparePicture(await deck.picture(entry));
              if (picture) texts.push(await this.tesseract.read(picture));
            } catch (error) {
              if (!(error instanceof Unreadable)) throw error;
              this.logger.warn(
                `${input.name}: ${entry} on slide ${slide} can't be read: ${error.message}`,
              );
            }
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
  // that is the file's fault is empty; any other error fails the job.
  private async pages(
    input: ProcessorInput,
    total: number,
    todo: number[],
    read: (page: number, expired: () => boolean) => Promise<string>,
  ) {
    const parts = Array<string>(total).fill('');
    const deadline = Date.now() + DEADLINE_MS;
    const expired = () => Date.now() > deadline;
    for (const [done, page] of todo.entries()) {
      if (done >= MAX_PAGES || expired()) {
        this.logger.warn(
          `${input.name}: ${todo.length - done} of ${todo.length} pages left unread`,
        );
        break;
      }
      try {
        parts[page - 1] = await read(page, expired);
      } catch (error) {
        if (!(error instanceof Unreadable)) throw error;
        this.logger.warn(
          `${input.name}: page ${page} can't be read: ${error.message}`,
        );
      }
    }
    return parts;
  }

  // the bundler finds a worker's file only in `new Worker(new URL(...))`
  private pdfWorker(workerData: object) {
    return new Worker(new URL('./pdf.worker.ts', import.meta.url), {
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    });
  }

  private deckWorker(workerData: object) {
    return new Worker(new URL('./deck.worker.ts', import.meta.url), {
      workerData,
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    });
  }
}
