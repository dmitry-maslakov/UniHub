import { describe, expect, it } from 'vitest';
import { partNoun } from './part-noun';

describe('partNoun', () => {
  it("calls a PDF's parts pages, a deck's slides, anything else's parts", () => {
    expect(partNoun('application/pdf', 'a.pdf')).toBe('page');
    expect(partNoun(null, 'deck.pptx')).toBe('slide');
    expect(partNoun(null, 'notes.docx')).toBe('section');
    expect(partNoun(null, 'main.c')).toBe('section');
  });
});
