import { posix } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { DOMParser } from '@xmldom/xmldom';
import yauzl from 'yauzl';

// Run by ocr.processor.ts in a thread of its own: opens a pptx and finds the
// pictures on the slides with little text, so that no XML is parsed on the
// main thread. Imports nothing of this repo: in tests node runs it as it is,
// types stripped.
//
// `{ data }` posts `{ slides, pictures, unreadable }`: the number of slides,
// in the order `p:sldIdLst` gives them (which is the numbering office-text
// has); for each slide with under `MIN_TEXT` characters that aren't white
// space in its `<a:t>`, `[slide (1-based), entries]`, the names of its
// pictures' entries (`MAX_PICTURES` at most, in document order, allowed
// extensions); and the slides whose parts could not be read. `{ refused:
// true }` when it is not a deck that can be read (not a zip, too many
// entries, `ppt/presentation.xml` missing or past `MAX_XML`), which is the
// file's fault.
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

// an XML entry past this isn't parsed
const MAX_XML = 10 * 1024 * 1024;
// a zip with more entries than this isn't opened
const MAX_ENTRIES = 20_000;
const MAX_PICTURES = 6;
const MIN_TEXT = 30;
const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.tif',
  '.tiff',
];
// officeparser's: which parts are slides, and how they are numbered
const SLIDE_PART = /ppt\/slides\/slide\d+.xml/;
const SLIDE_NUMBER = /lide(\d+)\.xml/;

const parse = (xml: Buffer) =>
  new DOMParser({
    // a malformed part is the file's fault, not a warning on the console
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(message);
    },
  }).parseFromString(xml.toString().replace(/^﻿/, ''), 'text/xml');

// where a relationship's target is: absolute in the package, or relative to
// the directory of the part that has the relationship
const resolve = (from: string, target: string) =>
  target.startsWith('/') ? target.slice(1) : posix.join(from, target);

async function scan(data: Uint8Array) {
  const zip = await yauzl.fromBufferPromise(Buffer.from(data));
  try {
    if (zip.entryCount > MAX_ENTRIES) throw new Error('too many entries');
    const entries = new Map<string, yauzl.Entry>();
    for await (const entry of zip.eachEntry())
      entries.set(entry.fileName, entry);

    // An entry's bytes; null when it's not there, throws past MAX_XML.
    const xmlOf = async (name: string) => {
      const entry = entries.get(name);
      if (!entry) return null;
      if (entry.uncompressedSize > MAX_XML)
        throw new Error(`${name} is larger than ${MAX_XML} bytes`);
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_XML) {
          stream.destroy();
          throw new Error(`${name} is larger than ${MAX_XML} bytes`);
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };

    // relationship id -> target, of the part's `_rels`
    const relationships = async (part: string) => {
      const rels = new Map<string, string>();
      const xml = await xmlOf(
        posix.join(
          posix.dirname(part),
          '_rels',
          `${posix.basename(part)}.rels`,
        ),
      );
      if (xml)
        for (const rel of Array.from(
          parse(xml).getElementsByTagNameNS(RELS, 'Relationship'),
        ))
          rels.set(rel.getAttribute('Id')!, rel.getAttribute('Target')!);
      return rels;
    };

    // The slides' parts as officeparser takes them: those of the slide list
    // that have a relationship and a part, and are slide parts, once each;
    // if that names none, every slide part by its number. A list or its
    // relationships that can't be read name none.
    const list = await xmlOf('ppt/presentation.xml');
    if (!list) throw new Error('no ppt/presentation.xml');
    const listed = new Set<string>();
    try {
      const rels = await relationships('ppt/presentation.xml');
      const ids = parse(list).getElementsByTagNameNS(P, 'sldIdLst')[0];
      for (const slide of Array.from(
        ids?.getElementsByTagNameNS(P, 'sldId') ?? [],
      )) {
        const target = rels.get(slide.getAttributeNS(R, 'id') ?? '');
        const part = target && resolve('ppt', target);
        if (part && entries.has(part) && SLIDE_PART.test(part))
          listed.add(part);
      }
    } catch {
      listed.clear();
    }
    const slides =
      listed.size > 0
        ? [...listed]
        : [...entries.keys()]
            .filter((name) => SLIDE_PART.test(name))
            .map((name, order) => ({
              name,
              order,
              number: Number(SLIDE_NUMBER.exec(name)?.[1] ?? 0),
            }))
            .sort((a, b) => a.number - b.number || a.order - b.order)
            .map(({ name }) => name);

    const pictures: [number, string[]][] = [];
    const unreadable: number[] = [];
    for (const [i, slide] of slides.entries()) {
      try {
        const found = await picturesOf(slide, xmlOf, relationships);
        if (found.length > 0) pictures.push([i + 1, found]);
      } catch {
        unreadable.push(i + 1);
      }
    }
    return { slides: slides.length, pictures, unreadable };
  } finally {
    zip.close();
  }
}

// The pictures' entries on a slide, none if it has text of its own.
async function picturesOf(
  slide: string,
  xmlOf: (name: string) => Promise<Buffer | null>,
  relationships: (part: string) => Promise<Map<string, string>>,
) {
  const xml = await xmlOf(slide);
  if (!xml) throw new Error(`no ${slide}`);
  const doc = parse(xml);
  const text = Array.from(doc.getElementsByTagNameNS(A, 't'))
    .map((t) => t.textContent ?? '')
    .join('')
    .replace(/\s/g, '');
  if (text.length >= MIN_TEXT) return [];
  const rels = await relationships(slide);
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

const { data }: { data: Uint8Array } = workerData;
// whatever goes wrong in reading the zip and its parts is the file's
parentPort!.postMessage(await scan(data).catch(() => ({ refused: true })));
