import type { Tesseract } from './tesseract.js';

// Stands in for Tesseract in the specs: records the pictures it's given and
// answers `read 1`, `read 2`… unless told what to do.
export class FakeTesseract implements Pick<Tesseract, 'read' | 'ready'> {
  readonly calls: Buffer[] = [];
  // runs on each call, may delay it or throw
  onRead: (call: number) => Promise<string | void> | string | void = () =>
    undefined;

  // what the check of the binary and its languages does
  ready: () => Promise<void> = async () => undefined;

  async read(png: Buffer) {
    this.calls.push(png);
    return (
      (await this.onRead(this.calls.length)) ?? `read ${this.calls.length}`
    );
  }
}
