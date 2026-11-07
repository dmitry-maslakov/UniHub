import { describe, expect, it } from 'vitest';
import { formatters } from './use-format';

const day = new Date(2026, 10, 7, 15, 5);

describe('formatters', () => {
  it('says dates as each language does', () => {
    expect(formatters('en').date(day)).toBe('Nov 7, 2026');
    expect(formatters('sr-Latn').date(day)).toBe('7. nov 2026.');
    expect(formatters('en').dateTime(day)).toBe('Nov 7, 2026, 3:05 PM');
    expect(formatters('sr-Latn').dateTime(day)).toBe('7. nov 2026. 15:05');
  });

  it('says a day of this year without its year, of another with it', () => {
    const now = new Date(2026, 10, 7);
    const thisYear = new Date(2026, 10, 3);
    const other = new Date(2025, 10, 3);
    expect(formatters('en').shortDate(thisYear, now)).toBe('Nov 3');
    expect(formatters('sr-Latn').shortDate(thisYear, now)).toBe('3. nov');
    expect(formatters('en').shortDate(other, now)).toBe('Nov 3, 2025');
    expect(formatters('sr-Latn').shortDate(other, now)).toBe('3. nov 2025.');
  });

  it('says sizes as a file manager does, in each language', () => {
    expect(formatters('en').size(512)).toBe('512 B');
    expect(formatters('en').size(1_400_000)).toBe('1.4 MB');
    expect(formatters('sr-Latn').size(1_400_000)).toBe('1,4 MB');
    expect(formatters('en').size(2_500_000_000)).toBe('2.5 GB');
    expect(formatters('en').size(999_960)).toBe('1.0 MB');
    expect(formatters('en').count(2000)).toBe('2,000');
    expect(formatters('sr-Latn').count(2000)).toBe('2.000');
  });

  it('answers nothing for no value', () => {
    const format = formatters('en');
    expect(format.date(null)).toBeUndefined();
    expect(format.dateTime(undefined)).toBeUndefined();
    expect(format.shortDate(null)).toBeUndefined();
    expect(format.size(null)).toBeUndefined();
    expect(format.count(undefined)).toBeUndefined();
  });
});
