import { AcademicYear, CourseName, Slug } from './values.js';

describe('Slug', () => {
  it('is lower case, digits and single dashes', () => {
    for (const ok of ['ar', 'os-2', 'arhitektura-racunara'])
      expect(Slug.parse(ok)).toBe(ok);
    for (const bad of ['', 'Not A Slug', 'ar_', '-ar', 'ar-', 'a--r', 'ä'])
      expect(Slug.safeParse(bad).success).toBe(false);
  });
});

describe('CourseName', () => {
  it('is trimmed and never blank', () => {
    expect(CourseName.parse('  Operativni sistemi ')).toBe(
      'Operativni sistemi',
    );
    for (const bad of ['', '   '])
      expect(CourseName.safeParse(bad).success).toBe(false);
  });
});

describe('AcademicYear', () => {
  it('is a whole year, a plausible one', () => {
    expect(AcademicYear.parse(2026)).toBe(2026);
    for (const bad of [1900, 3000, 2026.5, Number.NaN])
      expect(AcademicYear.safeParse(bad).success).toBe(false);
  });
});
