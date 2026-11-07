import { InvalidError, NotFoundError } from '@app/kernel';

// what a user asked for and can't read: gone, never there, or not theirs,
// one answer for all three
export class NotReadableError extends NotFoundError {
  readonly reason = 'NOT_READABLE';

  constructor(
    readonly what: 'course' | 'item' | 'file' | 'member' | 'page' | 'download',
  ) {
    super(`${what} not found`);
  }
}

// more to download at once than the hub zips: refused as a whole, before
// anything is kept
export class DownloadTooLargeError extends InvalidError {
  readonly reason = 'DOWNLOAD_TOO_LARGE';

  constructor(readonly maxBytes: number) {
    super(`more than ${maxBytes} bytes in all`);
  }
}
