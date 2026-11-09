import { parentPort, workerData } from 'node:worker_threads';
import { PDFiumLibrary } from '@hyzyla/pdfium';

// Run by sharp-pdfium-renderer.ts in a thread of its own: opens the PDF and
// draws one page as a bitmap, the long side `maxSide` pixels. Imports
// nothing of this repo: in tests node runs it as it is, types stripped.
// Posts `{ refused: true }` when PDFium won't open the document, which is
// the file's fault; any other failure is the worker's, and throws.
const {
  data,
  page,
  maxSide,
}: { data: Uint8Array; page: number; maxSide: number } = workerData;

const library = await PDFiumLibrary.init();
try {
  const document = await library.loadDocument(data).catch(() => null);
  if (!document) {
    parentPort!.postMessage({ refused: true });
  } else {
    try {
      const pages = document.getPageCount();
      if (page > pages) {
        parentPort!.postMessage({ pages, bitmap: null });
      } else {
        const found = document.getPage(page - 1);
        const { originalWidth, originalHeight } = found.getOriginalSize();
        const {
          data: pixels,
          width,
          height,
        } = await found.render({
          scale: maxSide / Math.max(originalWidth, originalHeight),
          render: 'bitmap',
          colorSpace: 'RGBA',
        });
        parentPort!.postMessage({
          pages,
          bitmap: { data: pixels, width, height },
        });
      }
    } finally {
      document.destroy();
    }
  }
} finally {
  library.destroy();
}
