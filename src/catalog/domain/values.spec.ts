import { AcademicYear, CourseName, Slug } from './values.js';

describe('Slug', () => {
  it('is lower case, digits and single dashes', () => {
    for (const ok of ['os', 'os-2', 'operating-systems'])
      expect(Slug.parse(ok)).toBe(ok);
    for (const bad of ['', 'Not A Slug', 'os_', '-os', 'os-', 'a--r', 'ä'])
      expect(Slug.safeParse(bad).success).toBe(false);
  });
});

describe('CourseName', () => {
  it('is trimmed and never blank', () => {
    expect(CourseName.parse('  Operativni sistemi ')).toBe(
      'Operativni sistemi',
    );
    // a NUL postgres refuses: a 400, not a 500 from the insert
    for (const bad of ['', '   ', 'a\u0000b'])
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
