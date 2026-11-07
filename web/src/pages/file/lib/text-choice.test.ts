import { describe, expect, it } from 'vitest';
import { pickText } from './text-choice';

const texts = [
  { processor: 'office-text', version: 2, pages: 3 },
  { processor: 'ocr', version: 1, pages: 1 },
];

describe('pickText', () => {
  it('reads the text asked for, else the first', () => {
    expect(pickText(texts, 'ocr')).toBe(texts[1]);
    expect(pickText(texts, 'gone')).toBe(texts[0]);
    expect(pickText(texts)).toBe(texts[0]);
    expect(pickText([], 'ocr')).toBeUndefined();
  });
});
