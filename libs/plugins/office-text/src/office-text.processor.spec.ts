import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import { MAX_BYTES, OfficeTextProcessor } from './office-text.processor.js';

// as the hub hands it over: matched by its extension
const input = (
  name: string,
  content: () => Readable,
  matched = extname(name),
): ProcessorInput => ({
  name,
  mime: null,
  matched,
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () => content(),
});

const fixture = (name: string, matched?: string) =>
  input(
    name,
    () => createReadStream(join(import.meta.dirname, 'fixtures', name)),
    matched,
  );

describe('OfficeTextProcessor', () => {
  const processor = new OfficeTextProcessor();

  it('splits a pdf by page', async () => {
    expect(await processor.process(fixture('lecture.pdf'))).toEqual({
      parts: ['Lecture 5: caches', 'Direct mapped caches'],
    });
  });

  it('keeps the page numbers past a page without text', async () => {
    expect(await processor.process(fixture('gap.pdf'))).toEqual({
      parts: ['Caches', '', 'Summary'],
    });
  });

  it('keeps a page without text at the end', async () => {
    expect(await processor.process(fixture('blank-end.pdf'))).toEqual({
      parts: ['Caches', 'Summary', ''],
    });
  });

  it('splits a deck by slide', async () => {
    const { parts } = await processor.process(fixture('slides.pptx'));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('Pipelining');
    expect(parts[1]).toContain('Hazards');
  });

  it('splits a document by heading', async () => {
    expect(await processor.process(fixture('labs.docx'))).toEqual({
      parts: [
        'Lab 1\nInstall the toolchain.',
        'Lab 2\nWrite a loop in assembly.',
      ],
    });
  });

  it('splits the way the entry the hub matched says, a media type too', async () => {
    expect(
      await processor.process(fixture('lecture.pdf', 'application/pdf')),
    ).toEqual({ parts: ['Lecture 5: caches', 'Direct mapped caches'] });
  });

  it('fails on what it cannot parse, the thread it parsed in gone', async () => {
    const broken = input('broken.pdf', () => Readable.from(['not a pdf']));
    await expect(processor.process(broken)).rejects.toThrow();
  });

  it('refuses a document too large to parse, before reading all of it', async () => {
    const mib = Buffer.alloc(1024 * 1024);
    let read = 0;
    const endless = function* () {
      for (;;) {
        read += mib.length;
        yield mib;
      }
    };
    const huge = input('huge.pdf', () => Readable.from(endless()));

    await expect(processor.process(huge)).rejects.toThrow('not parsed');
    expect(read).toBeLessThanOrEqual(MAX_BYTES + 2 * mib.length);
  });
});
