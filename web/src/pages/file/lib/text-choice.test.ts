import { describe, expect, it } from 'vitest';
import { chosenText } from './text-choice';

const texts = [
  { processor: 'office-text', version: 2, pages: 3 },
  { processor: 'ocr', version: 1, pages: 1 },
];

describe('chosenText', () => {
  it('names the text asked for if the file has it', () => {
    expect(chosenText(texts, 'ocr')).toBe('ocr');
  });

  it('names none otherwise, for the hub to answer with the longest', () => {
    expect(chosenText(texts, 'gone')).toBeUndefined();
    expect(chosenText(texts)).toBeUndefined();
    expect(chosenText([], 'ocr')).toBeUndefined();
  });
});
