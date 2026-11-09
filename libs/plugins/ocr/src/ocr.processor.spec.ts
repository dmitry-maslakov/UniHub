import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { ZipFile } from 'yazl';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import { FakeTesseract } from './ocr.fakes.js';
import { DEADLINE_MS, MAX_PAGES, OcrProcessor } from './ocr.processor.js';
import type { Tesseract } from './tesseract.js';

const DECK_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// as the hub hands it over: matched by its extension
const input = (
  name: string,
  data: Buffer | (() => Readable),
  matched = extname(name),
): ProcessorInput => ({
  name,
  mime: null,
  matched,
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () =>
    typeof data === 'function' ? data() : Readable.from([data]),
});

const file = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));
const fixture = (name: string, matched?: string) =>
  input(name, file(name), matched);

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const rels = (body: string) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
const picSlide = (text = '') =>
  `<p:sld ${NS}><p:cSld><p:spTree>${text && `<a:t>${text}</a:t>`}<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`;
const listOf = (ids: string[]) =>
  `<p:presentation ${NS}><p:sldIdLst>${ids
    .map((id, i) => `<p:sldId id="${256 + i}" r:id="${id}"/>`)
    .join('')}</p:sldIdLst></p:presentation>`;

async function zipOf(files: Record<string, string | Buffer>) {
  const zip = new ZipFile();
  for (const [name, data] of Object.entries(files))
    zip.addBuffer(Buffer.from(data), name);
  zip.end();
  return buffer(zip.outputStream);
}

// The parts of a deck of `n` slides that are each one picture (`pictures[i]`
// for slide i + 1, else `picture`): slide list in order, rels, media.
function deckFiles(
  n: number,
  picture = file('blank.png'),
  pictures: Record<number, Buffer> = {},
) {
  const slides = Array.from({ length: n }, (_, i) => i + 1);
  const files: Record<string, string | Buffer> = {
    'ppt/presentation.xml': listOf(slides.map((i) => `rId${i}`)),
    'ppt/_rels/presentation.xml.rels': rels(
      slides
        .map(
          (i) =>
            `<Relationship Id="rId${i}" Type="slide" Target="slides/slide${i}.xml"/>`,
        )
        .join(''),
    ),
  };
  for (const i of slides) {
    files[`ppt/slides/slide${i}.xml`] = picSlide();
    files[`ppt/slides/_rels/slide${i}.xml.rels`] = rels(
      `<Relationship Id="rId1" Type="image" Target="../media/image${pictures[i] ? i : 0}.png"/>`,
    );
    if (pictures[i]) files[`ppt/media/image${i}.png`] = pictures[i];
  }
  files['ppt/media/image0.png'] = picture;
  return files;
}

const deckOf = async (n: number, picture = file('blank.png')) =>
  zipOf(deckFiles(n, picture));

const ENOENT = () =>
  Object.assign(new Error('spawn tesseract ENOENT'), { code: 'ENOENT' });

describe('OcrProcessor', () => {
  let tesseract: FakeTesseract;
  let processor: OcrProcessor;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tesseract = new FakeTesseract();
    processor = new OcrProcessor(tesseract as unknown as Tesseract);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe('an image', () => {
    it('has the text read off it as its one part', async () => {
      expect(await processor.process(fixture('latin.png'))).toEqual({
        parts: ['read 1'],
      });
    });

    it.each([
      ['image/png', 'png'],
      ['image/jpeg', 'jpeg'],
      ['image/gif', 'gif'],
      ['image/webp', 'webp'],
      ['image/tiff', 'tiff'],
    ] as const)('is read as %s too', async (mime, format) => {
      const data = await sharp(file('latin.png')).toFormat(format).toBuffer();

      expect(await processor.process(input('scan', data, mime))).toEqual({
        parts: ['read 1'],
      });
    });

    it('has no parts when nothing was read', async () => {
      tesseract.onRead = () => '';

      expect(await processor.process(fixture('blank.png'))).toEqual({
        parts: [],
      });
    });

    it("isn't read when its short side is under 48 pixels", async () => {
      expect(await processor.process(fixture('tiny.png'))).toEqual({
        parts: [],
      });
      expect(tesseract.calls).toHaveLength(0);
    });

    it('is handed over greyscale on white, twice the size when small', async () => {
      await processor.process(fixture('latin.png'));

      const { width, height, channels } = await sharp(
        tesseract.calls[0],
      ).metadata();
      // 1600 px is not under 1600, so it is fitted inside 4000 without growing
      expect([width, height, channels]).toEqual([1600, 240, 1]);

      const small = await sharp(file('latin.png')).resize(400).toBuffer();
      await processor.process(input('small.png', small));
      expect(await sharp(tesseract.calls[1]).metadata()).toMatchObject({
        width: 800,
      });
    });

    it('is a warning, not a failure, when it is corrupt', async () => {
      expect(
        await processor.process(input('x.png', Buffer.from('not a picture'))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.png'));
    });

    it('is not read when it is really an SVG behind a .png', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200"/></svg>',
      );

      expect(await processor.process(input('x.png', svg))).toEqual({
        parts: [],
      });
      expect(tesseract.calls).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.png'));
    });

    it('is a warning, not a failure, when it is past 30 MiB', async () => {
      const chunk = Buffer.alloc(1024 * 1024);
      const huge = () =>
        Readable.from(
          (function* () {
            for (let i = 0; i < 31; i++) yield chunk;
          })(),
        );

      expect(await processor.process(input('big.png', huge))).toEqual({
        parts: [],
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('big.png'));
      expect(tesseract.calls).toHaveLength(0);
    });

    it('fails the job when tesseract is not installed', async () => {
      tesseract.onRead = () => {
        throw Object.assign(new Error('spawn tesseract ENOENT'), {
          code: 'ENOENT',
        });
      };

      await expect(
        processor.process(fixture('latin.png')),
      ).rejects.toThrowError('ENOENT');
    });
  });

  describe('a pdf', () => {
    it('reads only the pages with no text layer, by their number', async () => {
      // page 3 has no text layer either, and nothing on it to read
      tesseract.onRead = (call) => (call === 2 ? '' : undefined);

      expect(await processor.process(fixture('mixed.pdf'))).toEqual({
        parts: ['', 'read 1', ''],
      });
      expect(tesseract.calls).toHaveLength(2);
    });

    it('is read by media type too', async () => {
      tesseract.onRead = (call) => (call === 2 ? '' : undefined);

      expect(
        await processor.process(fixture('mixed.pdf', 'application/pdf')),
      ).toEqual({ parts: ['', 'read 1', ''] });
    });

    it('has no parts when every page has its text', async () => {
      expect(await processor.process(fixture('text.pdf'))).toEqual({
        parts: [],
      });
      expect(tesseract.calls).toHaveLength(0);
    });

    it('has no parts when every page read comes out empty', async () => {
      tesseract.onRead = () => '';

      expect(await processor.process(fixture('mixed.pdf'))).toEqual({
        parts: [],
      });
    });

    it('goes on past a page that throws in the scan, and does not count it', async () => {
      // page 2 of this file is not a page; page 1 is empty
      expect(await processor.process(fixture('badpage.pdf'))).toEqual({
        parts: ['read 1', ''],
      });
      expect(tesseract.calls).toHaveLength(1);
    });

    it('is a warning when it is not a pdf', async () => {
      expect(
        await processor.process(input('x.pdf', Buffer.from('not a pdf'))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.pdf'));
    });

    it("fails the job on an error that is not the file's", async () => {
      tesseract.onRead = () => {
        throw new Error('boom');
      };

      await expect(processor.process(fixture('mixed.pdf'))).rejects.toThrow(
        'boom',
      );
    });

    it('fails the job when tesseract is missing on a page', async () => {
      tesseract.onRead = () => {
        throw ENOENT();
      };

      await expect(
        processor.process(fixture('mixed.pdf')),
      ).rejects.toThrowError('ENOENT');
    });

    it('fails the job, reading nothing, when the languages are not there', async () => {
      tesseract.ready = async () => {
        throw new Error('tesseract has no data for srp');
      };

      await expect(
        processor.process(fixture('mixed.pdf')),
      ).rejects.toThrowError('srp');
      expect(tesseract.calls).toHaveLength(0);
    });

    it('fails the job when the content can not be read', async () => {
      const broken = () =>
        new Readable({
          read() {
            this.destroy(new Error('blob gone'));
          },
        });

      await expect(processor.process(input('x.pdf', broken))).rejects.toThrow(
        'blob gone',
      );
    });
  });

  describe('a deck', () => {
    it('reads only the pictures on slides with little text, in the slide list order', async () => {
      // slide2.xml is first in the list, with text; slide1.xml has the picture
      expect(await processor.process(fixture('slides.pptx'))).toEqual({
        parts: ['', 'read 1'],
      });
      expect(tesseract.calls).toHaveLength(1);
    });

    it('is read by media type too', async () => {
      expect(
        await processor.process(fixture('slides.pptx', DECK_TYPE)),
      ).toEqual({ parts: ['', 'read 1'] });
    });

    it("isn't read for a picture under 48 pixels", async () => {
      const deck = await deckOf(1, file('tiny.png'));

      expect(await processor.process(input('t.pptx', deck))).toEqual({
        parts: [],
      });
      expect(tesseract.calls).toHaveLength(0);
    });

    it('reads at most 6 pictures of a slide', async () => {
      const zip = new ZipFile();
      const NS =
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      const ids = [1, 2, 3, 4, 5, 6, 7, 8];
      zip.addBuffer(
        Buffer.from(
          `<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
        ),
        'ppt/presentation.xml',
      );
      zip.addBuffer(
        Buffer.from(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
        ),
        'ppt/_rels/presentation.xml.rels',
      );
      zip.addBuffer(
        Buffer.from(
          `<p:sld ${NS}>${ids.map((i) => `<a:blip r:embed="rId${i}"/>`).join('')}</p:sld>`,
        ),
        'ppt/slides/slide1.xml',
      );
      zip.addBuffer(
        Buffer.from(
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="../media/a.emf"/>${ids
            .slice(1)
            .map((i) => `<Relationship Id="rId${i}" Target="../media/p.png"/>`)
            .join('')}</Relationships>`,
        ),
        'ppt/slides/_rels/slide1.xml.rels',
      );
      zip.addBuffer(file('blank.png'), 'ppt/media/p.png');
      zip.end();

      const { parts } = await processor.process(
        input('many.pptx', await buffer(zip.outputStream)),
      );

      // the .emf is skipped, then six of the seven pngs are read
      expect(tesseract.calls).toHaveLength(6);
      expect(parts).toHaveLength(1);
    });

    it('leaves only the slide whose picture is unreadable empty', async () => {
      const deck = await zipOf(
        deckFiles(3, file('blank.png'), { 1: Buffer.from('not a picture') }),
      );

      expect(await processor.process(input('bad.pptx', deck))).toEqual({
        parts: ['', 'read 1', 'read 2'],
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('slide 1'));
    });

    it('keeps what was read of a slide when one of its pictures is bad', async () => {
      const files = deckFiles(1);
      files['ppt/slides/slide1.xml'] = picSlide().replace(
        '<p:pic>',
        '<a:blip r:embed="rId2"/><p:pic>',
      );
      files['ppt/slides/_rels/slide1.xml.rels'] = rels(
        '<Relationship Id="rId1" Target="../media/bad.png"/><Relationship Id="rId2" Target="../media/image0.png"/>',
      );
      files['ppt/media/bad.png'] = 'not a picture';

      expect(
        await processor.process(input('b.pptx', await zipOf(files))),
      ).toEqual({ parts: ['read 1'] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('bad.png'));
    });

    it('fails the job when tesseract is missing on a picture', async () => {
      tesseract.onRead = () => {
        throw ENOENT();
      };

      await expect(
        processor.process(fixture('slides.pptx')),
      ).rejects.toThrowError('ENOENT');
    });

    it('leaves a picture past 30 MiB, the rest is read', async () => {
      const huge = Buffer.alloc(31 * 1024 * 1024);
      const deck = await zipOf(deckFiles(2, file('blank.png'), { 1: huge }));

      expect(await processor.process(input('h.pptx', deck))).toEqual({
        parts: ['', 'read 1'],
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('slide 1'));
    });

    it('is nothing read when its slide list is past 10 MiB', async () => {
      const files = deckFiles(1);
      files['ppt/presentation.xml'] =
        listOf(['rId1']) + ' '.repeat(10 * 1024 * 1024 + 1);

      expect(
        await processor.process(input('x.pptx', await zipOf(files))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.pptx'));
      expect(tesseract.calls).toHaveLength(0);
    });

    it('skips a slide whose XML is past 10 MiB', async () => {
      const files = deckFiles(2);
      files['ppt/slides/slide1.xml'] =
        picSlide() + ' '.repeat(10 * 1024 * 1024 + 1);

      expect(
        await processor.process(input('x.pptx', await zipOf(files))),
      ).toEqual({ parts: ['', 'read 1'] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('slide 1'));
    });

    it('is nothing read past 20,000 entries', async () => {
      const files = deckFiles(1);
      for (let i = 0; i < 20_000; i++) files[`pad/${i}`] = '';

      expect(
        await processor.process(input('many.pptx', await zipOf(files))),
      ).toEqual({ parts: [] });
      expect(tesseract.calls).toHaveLength(0);
    }, 60_000);

    it('reads XML that starts with a byte order mark', async () => {
      const files = deckFiles(2);
      for (const name of Object.keys(files))
        if (name.endsWith('.xml') || name.endsWith('.rels'))
          files[name] = '\uFEFF' + String(files[name]);

      expect(
        await processor.process(input('bom.pptx', await zipOf(files))),
      ).toEqual({ parts: ['read 1', 'read 2'] });
    });

    it('numbers the slides as office-text does when the list is malformed', async () => {
      // a duplicate, an id with no relationship, an id whose part is not
      // there, one that is not a slide part: all dropped; the rest in list order
      const files = deckFiles(3);
      files['ppt/slides/slide3.xml'] = picSlide('x'.repeat(40));
      files['ppt/presentation.xml'] = listOf([
        'rId3',
        'rId3',
        'rIdNone',
        'rIdGone',
        'rIdMedia',
        'rId1',
        'rId2',
      ]);
      files['ppt/_rels/presentation.xml.rels'] = rels(
        [
          '<Relationship Id="rId1" Target="slides/slide1.xml"/>',
          '<Relationship Id="rId2" Target="slides/slide2.xml"/>',
          '<Relationship Id="rId3" Target="slides/slide3.xml"/>',
          '<Relationship Id="rIdGone" Target="slides/slide9.xml"/>',
          '<Relationship Id="rIdMedia" Target="media/image0.png"/>',
        ].join(''),
      );

      // slide 3 (text) is first, then 1 and 2
      expect(
        await processor.process(input('m.pptx', await zipOf(files))),
      ).toEqual({ parts: ['', 'read 1', 'read 2'] });
    });

    it('takes every slide part by its number when the list names none', async () => {
      const files = deckFiles(3);
      files['ppt/presentation.xml'] = listOf(['rIdNone']);
      files['ppt/slides/slide2.xml'] = picSlide('x'.repeat(40));

      expect(
        await processor.process(input('n.pptx', await zipOf(files))),
      ).toEqual({ parts: ['read 1', '', 'read 2'] });
    });

    it('is a warning when there is no slide list', async () => {
      const zip = new ZipFile();
      zip.addBuffer(Buffer.from('x'), 'ppt/slides/slide1.xml');
      zip.end();

      expect(
        await processor.process(
          input('empty.pptx', await buffer(zip.outputStream)),
        ),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('empty.pptx'));
    });

    it('is a warning when it is not a zip', async () => {
      expect(
        await processor.process(input('x.pptx', Buffer.from('not a deck'))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.pptx'));
    });
  });

  describe('limits', () => {
    it(`reads ${MAX_PAGES} slides of a file and leaves the rest empty`, async () => {
      const deck = await deckOf(MAX_PAGES + 1);

      const { parts } = await processor.process(input('long.pptx', deck));

      expect(tesseract.calls).toHaveLength(MAX_PAGES);
      expect(parts).toHaveLength(MAX_PAGES + 1);
      expect(parts[MAX_PAGES - 1]).toBe(`read ${MAX_PAGES}`);
      expect(parts[MAX_PAGES]).toBe('');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('1 of 501 pages left unread'),
      );
    }, 60_000);

    it('stops reading past the deadline, checked before each page', async () => {
      const deck = await deckOf(4);
      let now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      tesseract.onRead = (call) => {
        if (call === 2) now += DEADLINE_MS + 1;
      };

      const { parts } = await processor.process(input('slow.pptx', deck));

      expect(parts).toEqual(['read 1', 'read 2', '', '']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('2 of 4 pages left unread'),
      );
    });

    it('reads two files at a time', async () => {
      const gate = Promise.withResolvers<void>();
      tesseract.onRead = async () => {
        await gate.promise;
      };
      const reads = [1, 2, 3].map(() =>
        processor.process(fixture('latin.png')),
      );

      await vi.waitFor(() => expect(tesseract.calls).toHaveLength(2));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(tesseract.calls).toHaveLength(2);

      gate.resolve();
      await Promise.all(reads);
      expect(tesseract.calls).toHaveLength(3);
    });
  });
});
