import { posix } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import yauzl from 'yauzl';
import { readUpTo } from '@app/plugin-sdk';

// A pptx, read for the pictures on the slides that have little text. Pure
// reading of the zip; nothing here knows Tesseract.

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

// a deck's xml entry past this isn't parsed
export const MAX_XML = 10 * 1024 * 1024;
// a picture in a deck past this isn't read
export const MAX_PICTURE = 30 * 1024 * 1024;
// pictures taken from one slide, in document order
export const MAX_PICTURES = 6;
// a slide with at least this many characters (not white space) has its text
export const MIN_TEXT = 30;

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.tif',
  '.tiff',
];

const parse = (xml: Buffer) =>
  new DOMParser({
    // a malformed part is the file's fault, not a warning on the console
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(message);
    },
  }).parseFromString(xml.toString(), 'text/xml');

// where a relationship's target is: absolute in the package, or relative to
// the directory of the part that has the relationship
const resolve = (from: string, target: string) =>
  target.startsWith('/') ? target.slice(1) : posix.join(from, target);

export class Deck {
  private constructor(
    private readonly zip: yauzl.ZipFile,
    private readonly entries: Map<string, yauzl.Entry>,
  ) {}

  static async open(data: Buffer) {
    const zip = await yauzl.fromBufferPromise(data);
    const entries = new Map<string, yauzl.Entry>();
    for await (const entry of zip.eachEntry())
      entries.set(entry.fileName, entry);
    return new Deck(zip, entries);
  }

  close() {
    this.zip.close();
  }

  // An entry's bytes; null when it's not there, throws past `max`.
  private async bytes(name: string, max: number) {
    const entry = this.entries.get(name);
    if (!entry) return null;
    if (entry.uncompressedSize > max)
      throw new Error(`${name} is larger than ${max} bytes`);
    const data = await readUpTo(
      await this.zip.openReadStreamPromise(entry),
      max,
    );
    if (!data) throw new Error(`${name} is larger than ${max} bytes`);
    return data;
  }

  // relationship id -> target, of the part's `_rels`
  private async relationships(part: string) {
    const rels = new Map<string, string>();
    const xml = await this.bytes(
      posix.join(posix.dirname(part), '_rels', `${posix.basename(part)}.rels`),
      MAX_XML,
    );
    if (xml)
      for (const rel of Array.from(
        parse(xml).getElementsByTagNameNS(RELS, 'Relationship'),
      ))
        rels.set(rel.getAttribute('Id')!, rel.getAttribute('Target')!);
    return rels;
  }

  // The slides' parts in the order presentation.xml lists them, which is
  // their number (not the order of their file names).
  async slides() {
    const list = await this.bytes('ppt/presentation.xml', MAX_XML);
    if (!list) throw new Error('no ppt/presentation.xml');
    const rels = await this.relationships('ppt/presentation.xml');
    return Array.from(parse(list).getElementsByTagNameNS(P, 'sldId')).map(
      (slide) => {
        const target = rels.get(slide.getAttributeNS(R, 'id')!);
        if (!target) throw new Error('a slide with no relationship');
        return resolve('ppt', target);
      },
    );
  }

  // The pictures' entries on a slide, none if it has text of its own.
  async pictures(slide: string) {
    const xml = await this.bytes(slide, MAX_XML);
    if (!xml) throw new Error(`no ${slide}`);
    const doc = parse(xml);
    const text = Array.from(doc.getElementsByTagNameNS(A, 't'))
      .map((t) => t.textContent ?? '')
      .join('')
      .replace(/\s/g, '');
    if (text.length >= MIN_TEXT) return [];
    const rels = await this.relationships(slide);
    const pictures: string[] = [];
    for (const blip of Array.from(doc.getElementsByTagNameNS(A, 'blip'))) {
      const target = rels.get(blip.getAttributeNS(R, 'embed') ?? '');
      if (
        target &&
        IMAGE_EXTENSIONS.includes(posix.extname(target).toLowerCase())
      )
        pictures.push(resolve(posix.dirname(slide), target));
    }
    return pictures.slice(0, MAX_PICTURES);
  }

  // a picture's bytes; null if it's too large or missing
  async picture(entry: string) {
    const entryInfo = this.entries.get(entry);
    if (!entryInfo || entryInfo.uncompressedSize > MAX_PICTURE) return null;
    return this.bytes(entry, MAX_PICTURE);
  }
}
