// How a picture is made of a file's bytes: the hub's own port, since the
// work is native code and a worker thread.
export abstract class PageRenderer {
  // a JPEG of an image, fitted inside the size an agent reads
  abstract image(data: Buffer): Promise<Buffer>;

  // a JPEG of one page (from 1) of a PDF, and how many pages it has; throws
  // NotReadableError('page') past the last, NotViewableError for a PDF
  // that can't be opened
  abstract pdf(
    data: Buffer,
    page: number,
  ): Promise<{ data: Buffer; pages: number }>;
}
