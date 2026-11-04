import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byHeading, byLines, MAX_MARKDOWN, MAX_PART } from './split.js';

const lines = (count: number, length: number) =>
  Array.from({ length: count }, () => `${'x'.repeat(length - 1)}\n`).join('');

describe('byLines', () => {
  it('keeps a short text whole', () => {
    expect(byLines('a\nb\n')).toEqual(['a\nb\n']);
  });

  it('fits whole lines in a part, the parts joined giving the text back', () => {
    const text = lines(250, 100);
    const parts = byLines(text);

    expect(parts.map((part) => part.length)).toEqual([
      MAX_PART,
      MAX_PART,
      5_000,
    ]);
    expect(parts.join('')).toBe(text);
  });

  it('ends a part at a blank line in its second half', () => {
    const text = `${lines(70, 100)}\n${lines(70, 100)}`;
    expect(byLines(text)[0]).toBe(`${lines(70, 100)}\n`);
  });

  it('cuts a line longer than a part at a space', () => {
    const words = 'word '.repeat(3_000);
    const parts = byLines(words);

    expect(parts[0]).toBe('word '.repeat(2_000));
    expect(parts.join('')).toBe(words);
  });

  it("cuts a line without spaces at the part's length, a character whole", () => {
    const text = `${'a'.repeat(MAX_PART - 1)}😀${'b'.repeat(10)}`;
    const parts = byLines(text);

    expect(parts[0]).toBe('a'.repeat(MAX_PART - 1));
    expect(parts[1]).toBe(`😀${'b'.repeat(10)}`);
  });
});

describe('byHeading', () => {
  const lab = readFileSync(
    join(import.meta.dirname, 'fixtures', 'lab.md'),
    'utf8',
  );

  it('makes a part of each section, a # in code or a quote no heading', () => {
    const parts = byHeading(lab);

    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe('Notes for the labs, read them first.\n\n');
    expect(parts[1]).toMatch(/^# Lab 1: a loop\n[^]*> # A quote/);
    expect(parts[2]).toBe('## Lab 2: pointers\n\nPointers and arrays.\n');
    expect(parts.join('')).toBe(lab);
  });

  it('puts the blank lines before the first heading in its section', () => {
    expect(byHeading('\n\n# A\ntext\n# B\n')).toEqual([
      '\n\n# A\ntext\n',
      '# B\n',
    ]);
  });

  it('goes on with a long section in the next part', () => {
    const long = `# A\n${lines(150, 100)}`;
    expect(byHeading(`${long}# B\n`)).toEqual([...byLines(long), '# B\n']);
  });

  it('splits markdown too large for marked by lines', () => {
    const large = `# A\n${lines(MAX_MARKDOWN / 64, 64)}# B\n`;
    expect(byHeading(large)).toEqual(byLines(large));
  });
});
