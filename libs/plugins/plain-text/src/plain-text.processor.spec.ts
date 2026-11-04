import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { ContentHash, type ProcessorInput } from '@app/plugin-sdk';
import {
  MAX_BYTES,
  MAX_NOTEBOOK_BYTES,
  PlainTextProcessor,
} from './plain-text.processor.js';
import { MAX_PART } from './split.js';

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

const bytes = (name: string) =>
  readFileSync(join(import.meta.dirname, 'fixtures', name));
const file = (name: string, data: Buffer, matched?: string) =>
  input(name, () => Readable.from([data]), matched);
const fixture = (name: string, matched?: string) =>
  file(name, bytes(name), matched);

describe('PlainTextProcessor', () => {
  const processor = new PlainTextProcessor();

  it('splits markdown by heading, the parts joined giving the file back', async () => {
    const { parts } = await processor.process(fixture('lab.md'));

    expect(parts.map((part) => part.split('\n')[0])).toEqual([
      'Notes for the labs, read them first.',
      '# Lab 1: a loop',
      '## Lab 2: pointers',
    ]);
    expect(parts.join('')).toBe(bytes('lab.md').toString());
  });

  it('reads code in a code page', async () => {
    const { parts } = await processor.process(fixture('nzd-cp1250.c'));

    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain('Računa najveći zajednički delilac');
  });

  it('splits a notebook matched by its media type by heading', async () => {
    const { parts } = await processor.process(
      fixture('lab.ipynb', 'application/x-ipynb+json'),
    );
    expect(parts).toHaveLength(2);
  });

  it('cuts a line of 50,000 characters into parts', async () => {
    const { parts } = await processor.process(fixture('one-line.json'));

    expect(parts).toHaveLength(6);
    expect(parts.every((part) => part.length <= MAX_PART)).toBe(true);
    expect(parts.join('')).toBe(bytes('one-line.json').toString());
  });

  it('makes no parts of binary content', async () => {
    expect(
      await processor.process(file('scan.txt', bytes('noise.png'))),
    ).toEqual({ parts: [] });
  });

  it('leaves minified code out, unread', async () => {
    const content = vi.fn(() => Readable.from(['$.fn={}']));
    expect(await processor.process(input('jquery.min.js', content))).toEqual({
      parts: [],
    });
    expect(content).not.toHaveBeenCalled();
  });

  it('skips a file too large, before reading all of it', async () => {
    const mib = Buffer.alloc(1024 * 1024, 'a');
    let read = 0;
    const endless = function* () {
      for (;;) {
        read += mib.length;
        yield mib;
      }
    };

    expect(
      await processor.process(
        input('huge.txt', () => Readable.from(endless())),
      ),
    ).toEqual({ parts: [] });
    expect(read).toBeLessThanOrEqual(MAX_BYTES + 2 * mib.length);
  });

  it('reads a notebook larger than that, for its pictures', async () => {
    const picture = 'A'.repeat(MAX_BYTES);
    const notebook = JSON.stringify({
      cells: [
        {
          cell_type: 'code',
          source: 'plot()',
          outputs: [{ data: { 'image/png': picture } }],
        },
      ],
    });
    expect(notebook.length).toBeLessThan(MAX_NOTEBOOK_BYTES);

    expect(
      await processor.process(file('plot.ipynb', Buffer.from(notebook))),
    ).toEqual({ parts: ['```\nplot()\n```'] });
  });
});
