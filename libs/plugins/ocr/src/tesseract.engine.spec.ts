import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ContentHash } from '@app/plugin-sdk';
import { ocrSettings } from './ocr.config.js';
import { OcrProcessor } from './ocr.processor.js';
import { preparePicture } from './picture.js';
import { Tesseract } from './tesseract.js';

// The real binary, with the languages production uses. Where it or they
// aren't installed this is skipped, but in CI (which installs them) it runs
// and fails: it can't be skipped there without being seen.
const LANGUAGES = 'srp_latn+eng,srp=srp+eng';
const installed = spawnSync('tesseract', ['--list-langs'], {
  encoding: 'utf8',
}).stdout?.split('\n');
const ready = ['eng', 'srp', 'srp_latn'].every((l) => installed?.includes(l));

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));

describe.skipIf(!ready && !process.env.CI)('Tesseract (the binary)', () => {
  const tesseract = new Tesseract(
    ocrSettings.parse({ OCR_LANGUAGES: LANGUAGES }),
  );
  const read = async (name: string) =>
    tesseract.read((await preparePicture(fixture(name)))!);

  it('reads Latin text with its diacritics', async () => {
    const text = await read('latin.png');
    for (const word of ['Računarske', 'mreže', 'protokoli'])
      expect(text).toContain(word);
  });

  it('reads Cyrillic in Cyrillic', async () => {
    const text = await read('cyrillic.png');
    for (const word of ['Рачунарске', 'мреже', 'протоколи'])
      expect(text).toContain(word);
    expect(text).not.toMatch(/[A-Za-z]/);
  });

  it('reads nothing off a picture with no text', async () => {
    expect(await read('blank.png')).toBe('');
  });

  it('reads the picture page of a pdf and the picture slide of a deck', async () => {
    const processor = new OcrProcessor(tesseract);
    const input = (name: string, matched: string) => ({
      name,
      mime: null,
      matched,
      hash: ContentHash.parse('0'.repeat(64)),
      content: async () => Readable.from([fixture(name)]),
    });

    const pdf = await processor.process(input('mixed.pdf', '.pdf'));
    expect(pdf.parts).toHaveLength(3);
    expect(pdf.parts[0]).toBe('');
    expect(pdf.parts[1]).toContain('protokoli');

    const deck = await processor.process(input('slides.pptx', '.pptx'));
    expect(deck.parts[0]).toBe('');
    expect(deck.parts[1]).toContain('protokoli');
  });
});
