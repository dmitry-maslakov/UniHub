import yauzl from 'yauzl';
import { readUpTo } from '@app/plugin-sdk';
import { Unreadable } from './unreadable.js';

// A pptx's pictures. Which slides have pictures to read, and where, is
// deck.worker.ts's to find (it parses the XML); this only takes the bytes of
// the entries it names.

// a picture in a deck past this isn't read
export const MAX_PICTURE = 30 * 1024 * 1024;

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.tif',
  '.tiff',
];

export class Pictures {
  private constructor(
    private readonly zip: yauzl.ZipFile,
    private readonly entries: Map<string, yauzl.Entry>,
  ) {}

  // the worker has opened this zip already, and found it to have few entries
  static async open(data: Buffer) {
    try {
      const zip = await yauzl.fromBufferPromise(data);
      const entries = new Map<string, yauzl.Entry>();
      for await (const entry of zip.eachEntry())
        entries.set(entry.fileName, entry);
      return new Pictures(zip, entries);
    } catch (error) {
      throw new Unreadable('not a zip', { cause: error });
    }
  }

  close() {
    this.zip.close();
  }

  // an entry's bytes; throws Unreadable if it's missing, too large or corrupt
  async picture(name: string) {
    const entry = this.entries.get(name);
    if (!entry) throw new Unreadable(`no ${name}`);
    if (entry.uncompressedSize > MAX_PICTURE)
      throw new Unreadable(`${name} is larger than ${MAX_PICTURE} bytes`);
    let data: Buffer | null;
    try {
      data = await readUpTo(
        await this.zip.openReadStreamPromise(entry),
        MAX_PICTURE,
      );
    } catch (error) {
      throw new Unreadable(`${name} can't be read`, { cause: error });
    }
    if (!data)
      throw new Unreadable(`${name} is larger than ${MAX_PICTURE} bytes`);
    return data;
  }
}
