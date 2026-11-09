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

// A deck of `n` slides that are each one picture, with the parts a reader
// needs; `list` is the order presentation.xml gives, as indexes.
async function deckOf(n: number, picture = file('blank.png')) {
  const zip = new ZipFile();
  const add = (name: string, data: string | Buffer) =>
    zip.addBuffer(Buffer.from(data), name);
  const NS =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const rels = (body: string) =>
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
  const slides = Array.from({ length: n }, (_, i) => i + 1);
  add(
    'ppt/presentation.xml',
    `<p:presentation ${NS}><p:sldIdLst>${slides
      .map((i) => `<p:sldId id="${255 + i}" r:id="rId${i}"/>`)
      .join('')}</p:sldIdLst></p:presentation>`,
  );
  add(
    'ppt/_rels/presentation.xml.rels',
    rels(
      slides
        .map(
          (i) =>
            `<Relationship Id="rId${i}" Type="slide" Target="slides/slide${i}.xml"/>`,
        )
        .join(''),
    ),
  );
  for (const i of slides) {
    add(
      `ppt/slides/slide${i}.xml`,
      `<p:sld ${NS}><p:cSld><p:spTree><p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`,
    );
    add(
      `ppt/slides/_rels/slide${i}.xml.rels`,
      rels(
        '<Relationship Id="rId1" Type="image" Target="../media/image1.png"/>',
      ),
    );
  }
  zip.addBuffer(picture, 'ppt/media/image1.png');
  zip.end();
  return buffer(zip.outputStream);
}

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

    it('is a warning when it is not a pdf', async () => {
      expect(
        await processor.process(input('x.pdf', Buffer.from('not a pdf'))),
      ).toEqual({ parts: [] });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('x.pdf'));
    });

    it('is a page left empty when its reading fails', async () => {
      tesseract.onRead = () => {
        throw new Error('boom');
      };

      expect(await processor.process(fixture('mixed.pdf'))).toEqual({
        parts: [],
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('page 2'));
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
