import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { firstMessage } from '@app/plugin-sdk';
import {
  NotReadableError,
  NotViewableError,
} from '../../application/errors.js';
import { PageRenderer } from '../../application/renderer.js';
import { imageToJpeg, MAX_SIDE, toJpeg } from './jpeg.js';

// a PDF is untrusted: it is drawn in a thread of its own, held to a heap
// and a time
const HEAP_MB = 512;
const TIMEOUT_MS = 30_000;

interface Drawn {
  pages: number;
  bitmap: { data: Uint8Array; width: number; height: number } | null;
}

// Pictures by sharp (libvips), a PDF's pages by PDFium (WebAssembly, no
// native code) in a worker thread, then through sharp to the same JPEG.
@Injectable()
export class SharpPdfiumRenderer extends PageRenderer {
  async image(data: Buffer) {
    try {
      return await imageToJpeg(data);
    } catch (error) {
      throw new NotViewableError('the image can not be read', { cause: error });
    }
  }

  async pdf(data: Buffer, page: number) {
    let drawn: Drawn;
    try {
      drawn = await firstMessage<Drawn>(
        new Worker(new URL('./pdf.worker.ts', import.meta.url), {
          workerData: { data, page, maxSide: MAX_SIDE },
          resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
        }),
        TIMEOUT_MS,
      );
    } catch (error) {
      throw new NotViewableError('the PDF can not be opened', { cause: error });
    }
    const { pages, bitmap } = drawn;
    if (!bitmap) throw new NotReadableError('page');
    const { data: raw, width, height } = bitmap;
    return {
      pages,
      data: await toJpeg(sharp(raw, { raw: { width, height, channels: 4 } })),
    };
  }
}
