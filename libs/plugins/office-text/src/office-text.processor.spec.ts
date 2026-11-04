import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import { OfficeTextProcessor } from './office-text.processor.js';

// as the hub hands it over: matched by its extension, the content unused
const fixture = (name: string, matched = extname(name)): ProcessorInput => ({
  name,
  mime: null,
  matched,
  hash: ContentHash.parse('0'.repeat(64)),
  content: async () =>
    createReadStream(join(import.meta.dirname, 'fixtures', name)),
});

describe('OfficeTextProcessor', () => {
  const processor = new OfficeTextProcessor();

  it('splits a pdf by page', async () => {
    expect(await processor.process(fixture('lecture.pdf'))).toEqual({
      parts: ['Lecture 5: caches', 'Direct mapped caches'],
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
});
