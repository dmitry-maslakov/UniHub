import { meanConfidence, parseTsv, textOf } from './tsv.js';

const HEADER =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
// a word row: level 5
const row = (
  block: number,
  paragraph: number,
  line: number,
  word: number,
  conf: number,
  text: string,
) =>
  `5\t1\t${block}\t${paragraph}\t${line}\t${word}\t0\t0\t10\t10\t${conf}\t${text}`;
const tsv = (...rows: string[]) => [HEADER, ...rows].join('\n') + '\n';

describe('parseTsv', () => {
  it('takes the rows with a confidence and a word, with their place', () => {
    expect(
      parseTsv(
        tsv(
          '1\t1\t0\t0\t0\t0\t0\t0\t100\t100\t-1\t',
          '4\t1\t1\t1\t1\t0\t0\t0\t10\t10\t-1\t',
          row(1, 1, 1, 1, 96.5, 'Računarske'),
          row(1, 1, 1, 2, 90, '   '),
          row(1, 1, 2, 1, 0, 'mreže'),
        ),
      ),
    ).toEqual([
      { block: 1, paragraph: 1, line: 1, conf: 96.5, text: 'Računarske' },
      { block: 1, paragraph: 1, line: 2, conf: 0, text: 'mreže' },
    ]);
  });

  it('copes with CRLF and a header alone', () => {
    expect(parseTsv(`${HEADER}\r\n`)).toEqual([]);
    expect(parseTsv(`${HEADER}\r\n${row(1, 1, 1, 1, 80, 'ok')}\r\n`)).toEqual([
      { block: 1, paragraph: 1, line: 1, conf: 80, text: 'ok' },
    ]);
  });
});

describe('meanConfidence', () => {
  it('weighs each word by its length', () => {
    const word = (conf: number, text: string) => ({
      block: 1,
      paragraph: 1,
      line: 1,
      conf,
      text,
    });
    expect(meanConfidence([word(100, 'abcd'), word(50, 'ab')])).toBeCloseTo(
      (100 * 4 + 50 * 2) / 6,
    );
  });

  it('is 0 for no words', () => {
    expect(meanConfidence([])).toBe(0);
  });
});

describe('textOf', () => {
  const words = (...rows: string[]) => parseTsv(tsv(...rows));

  it('joins words by a space, lines by a newline, paragraphs and blocks by a blank line', () => {
    expect(
      textOf(
        words(
          row(1, 1, 1, 1, 90, 'One'),
          row(1, 1, 1, 2, 90, 'two'),
          row(1, 1, 2, 1, 90, 'three'),
          row(1, 2, 1, 1, 90, 'four'),
          row(2, 1, 1, 1, 90, 'five'),
        ),
      ),
    ).toBe('One two\nthree\n\nfour\n\nfive');
  });

  it('drops words under confidence 40, and words with no letter or digit', () => {
    expect(
      textOf(
        words(
          row(1, 1, 1, 1, 39.9, 'noise'),
          row(1, 1, 1, 2, 40, 'kept'),
          row(1, 1, 1, 3, 95, '|'),
          row(1, 1, 1, 4, 95, '—'),
          row(1, 1, 1, 5, 95, '42,'),
          row(1, 1, 2, 1, 95, 'ž'),
        ),
      ),
    ).toBe('kept 42,\nž');
  });

  it('lets a paragraph break stand only between words that stay', () => {
    expect(
      textOf(
        words(
          row(1, 1, 1, 1, 90, 'first'),
          row(1, 2, 1, 1, 10, 'noise'),
          row(1, 2, 2, 1, 90, 'second'),
        ),
      ),
    ).toBe('first\n\nsecond');
  });

  it('counts under 3 characters as nothing', () => {
    expect(textOf(words(row(1, 1, 1, 1, 90, 'ab')))).toBe('');
    expect(
      textOf(words(row(1, 1, 1, 1, 90, 'a'), row(1, 1, 1, 2, 90, 'b'))),
    ).toBe('a b');
    expect(textOf([])).toBe('');
  });
});
