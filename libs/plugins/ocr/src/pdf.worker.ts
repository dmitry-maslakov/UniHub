import { parentPort, workerData } from 'node:worker_threads';
import { PDFiumLibrary } from '@hyzyla/pdfium';

// Run by ocr.processor.ts in a thread of its own, one per job so that a
// page's memory and failure stay its own. Imports nothing of this repo: in
// tests node runs it as it is, types stripped.
//
// `{ data, scan: true }` posts `{ pages, textless }`: the page count and the
// pages (1-based) with less than `MIN_TEXT` characters that aren't white
// space in their text layer. `{ data, page }` posts the page as
// `{ width, height, data }`, 200 DPI, its long side at most `MAX_SIDE`
// pixels, RGBA. Either posts `{ refused: true }` when PDFium won't open the
// document, which is the file's fault.
const MIN_TEXT = 30;
const MAX_SIDE = 3500;
const SCALE = 200 / 72;

const { data, scan, page }: { data: Uint8Array; scan?: true; page?: number } =
  workerData;

const library = await PDFiumLibrary.init();
try {
  const document = await library.loadDocument(data).catch(() => null);
  if (!document) {
    parentPort!.postMessage({ refused: true });
  } else {
    try {
      if (scan) {
        const pages = document.getPageCount();
        const textless: number[] = [];
        for (let n = 1; n <= pages; n++)
          if (
            document
              .getPage(n - 1)
              .getText()
              .replace(/\s/g, '').length < MIN_TEXT
          )
            textless.push(n);
        parentPort!.postMessage({ pages, textless });
      } else {
        const found = document.getPage(page! - 1);
        const { originalWidth, originalHeight } = found.getOriginalSize();
        const {
          data: pixels,
          width,
          height,
        } = await found.render({
          scale: Math.min(
            SCALE,
            MAX_SIDE / Math.max(originalWidth, originalHeight),
          ),
          render: 'bitmap',
          colorSpace: 'RGBA',
        });
        parentPort!.postMessage({ width, height, data: pixels }, [
          pixels.buffer as ArrayBuffer,
        ]);
      }
    } finally {
      document.destroy();
    }
  }
} finally {
  library.destroy();
}
