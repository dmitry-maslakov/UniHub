import { Worker } from 'node:worker_threads';
import { Logger } from '@nestjs/common';
import {
  firstMessage,
  readUpTo,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { IMAGE_EXTENSIONS, MAX_PICTURE, Pictures } from './deck.js';
import { fromWorker, Unreadable } from './unreadable.js';

export const IMAGES = [
  ...IMAGE_EXTENSIONS,
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/tiff',
];
export const PDF = ['.pdf', 'application/pdf'];
export const DECK = [
  '.pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

// a pdf or a deck past this isn't read
export const MAX_BYTES = 100 * 1024 * 1024;
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

// Pages or slides read of one file, and the time they get; past either the
// rest are left empty.
export interface Limits {
  maxPages: number;
  deadlineMs: number;
}

// What the processors that read pictures share: the images, the textless
// pages of a pdf and the pictures on a deck's slides, as parts (a page or
// slide each, empty where nothing was read; an image has one). A processor
// says how a picture is prepared and how it's read.
//
// A file that can't be read is the file's fault, not a failed job (it would
// be tried again for ever): it's logged and gives what was read, if
// anything. What fails the job is anything else: a reader that isn't there,
// a blob that can't be read, a worker that can't start.
export abstract class PictureWalk implements ProcessesContent {
  protected readonly logger = new Logger(this.constructor.name);
  protected abstract readonly limits: Limits;

  abstract process(input: ProcessorInput): Promise<{ parts: string[] }>;

  // null when the picture is too small to hold anything; throws Unreadable
  protected abstract prepare(data: Buffer): Promise<Buffer | null>;
  // a page PDFium drew (RGBA)
  protected abstract preparePage(
    raw: Uint8Array,
    width: number,
    height: number,
  ): Promise<Buffer>;
  protected abstract read(
    picture: Buffer,
    input: ProcessorInput,
  ): Promise<string>;

  protected async walk(input: ProcessorInput) {
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
          : await this.image(input, data);
    } catch (error) {
      if (!(error instanceof Unreadable)) throw error;
      this.logger.warn(`${input.name} can't be read: ${error.message}`);
    }
    return { parts: parts.every((part) => part === '') ? [] : parts };
  }

  private async image(input: ProcessorInput, data: Buffer) {
    const picture = await this.prepare(data);
    return picture ? [await this.read(picture, input)] : [];
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
      return this.read(await this.preparePage(raw, width, height), input);
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
            input.signal?.throwIfAborted();
            // one bad picture is skipped, the slide keeps what was read
            try {
              const picture = await this.prepare(await deck.picture(entry));
              if (picture) texts.push(await this.read(picture, input));
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
  // that is the file's fault is empty; any other error fails the job, and so
  // does the input's signal.
  private async pages(
    input: ProcessorInput,
    total: number,
    todo: number[],
    read: (page: number, expired: () => boolean) => Promise<string>,
  ) {
    const parts = Array<string>(total).fill('');
    const deadline = Date.now() + this.limits.deadlineMs;
    const expired = () => Date.now() > deadline;
    for (const [done, page] of todo.entries()) {
      input.signal?.throwIfAborted();
      if (done >= this.limits.maxPages || expired()) {
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
