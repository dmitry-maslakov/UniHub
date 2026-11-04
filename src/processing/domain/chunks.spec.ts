import { CHUNK_CHARS, chunksOf, HIGHLIGHT } from './chunks.js';

const texts = (parts: string[]) => chunksOf(parts).map(({ text }) => text);
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');

describe('chunksOf', () => {
  it('numbers chunks within their page, pages from 1, skipping empty ones', () => {
    expect(chunksOf(['  one  ', '', ' \n ', 'three'])).toEqual([
      { page: 1, chunk: 0, text: 'one' },
      { page: 4, chunk: 0, text: 'three' },
    ]);
  });

  it('cuts a long page into chunks of at most CHUNK_CHARS, all of it kept', () => {
    const page = words(1000);
    const chunks = chunksOf([page]);

    expect(chunks.map(({ chunk }) => chunk)).toEqual([0, 1, 2, 3, 4]);
    expect(chunks.every(({ text }) => text.length <= CHUNK_CHARS)).toBe(true);
    expect(chunks.map(({ text }) => text).join(' ')).toBe(page);
  });

  it('ends a chunk at the last paragraph past half the window, else line, else word', () => {
    const line = 'x'.repeat(700);
    expect(texts([`${line}\n\n${line} ${line}`])[0]).toBe(line);
    expect(texts([`${line}\n${'x'.repeat(100)} ${line}`])[0]).toBe(line);
    // a paragraph break in the first half doesn't count
    expect(texts([`${'x'.repeat(10)}\n\n${line} ${line}`])[0]).toBe(
      `${'x'.repeat(10)}\n\n${line}`,
    );
  });

  it('cuts text without a break at CHUNK_CHARS, never inside a surrogate pair', () => {
    expect(texts(['x'.repeat(CHUNK_CHARS + 5)]).map((t) => t.length)).toEqual([
      CHUNK_CHARS,
      5,
    ]);
    const emoji = texts([`${'x'.repeat(CHUNK_CHARS - 1)}😀😀`]);
    expect(emoji[0]).toBe('x'.repeat(CHUNK_CHARS - 1));
    expect(emoji[1]).toBe('😀😀');
  });

  it('takes the highlight markers out of the text', () => {
    const { open, close } = HIGHLIGHT;
    expect(texts([`a${open}b${close}c`])).toEqual(['a\uFFFDb\uFFFDc']);
  });

  it('gives decomposed text the chunks of its composed form', () => {
    const composed = `Čačak ${words(400)} đak`;
    expect(chunksOf([composed.normalize('NFD')])).toEqual(chunksOf([composed]));
  });

  it('cuts the same text the same way every time', () => {
    const page = `${words(300)}\n${words(300)}\n\n${words(300)}`;
    expect(chunksOf([page])).toEqual(chunksOf([page]));
  });
});
