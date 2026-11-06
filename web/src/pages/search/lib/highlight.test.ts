import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

describe('highlight', () => {
  it('cuts a snippet where the words matched', () => {
    expect(
      highlight('the stack and the heap', [
        [4, 9],
        [18, 22],
      ]),
    ).toEqual([
      { text: 'the ', match: false },
      { text: 'stack', match: true },
      { text: ' and the ', match: false },
      { text: 'heap', match: true },
    ]);
  });

  it('survives overlaps and offsets past the end', () => {
    expect(
      highlight('abcdef', [
        [2, 5],
        [0, 3],
        [4, 99],
      ]),
    ).toEqual([
      { text: 'abc', match: true },
      { text: 'de', match: true },
      { text: 'f', match: true },
    ]);
  });
});
