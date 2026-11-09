import { describe, expect, it } from 'vitest';
import { machineNote } from './machine-note';

describe('machineNote', () => {
  it('says ocr and reader texts were recognized', () => {
    expect(machineNote('ocr')).toBe('text.recognized');
    expect(machineNote('reader')).toBe('text.recognized');
  });

  it('says vision texts were described', () => {
    expect(machineNote('vision')).toBe('text.described');
  });

  it('has none for the rest', () => {
    expect(machineNote('office-text')).toBeNull();
  });
});
