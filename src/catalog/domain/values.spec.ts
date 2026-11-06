import { PortalId } from '@app/kernel';
import {
  AcademicYear,
  CourseName,
  CourseSlug,
  portalCourseSlug,
  Slug,
} from './values.js';

describe('Slug', () => {
  it('is lower case, digits and single dashes', () => {
    for (const ok of ['os', 'os-2', 'operating-systems'])
      expect(Slug.parse(ok)).toBe(ok);
    for (const bad of ['', 'Not A Slug', 'os_', '-os', 'os-', 'a--r', 'ä'])
      expect(Slug.safeParse(bad).success).toBe(false);
  });
});

describe('portalCourseSlug', () => {
  const canvas = PortalId.parse('canvas');

  it("is the portal's id and the portal course's, one a reader may name", () => {
    expect(portalCourseSlug(canvas, '101')).toBe('canvas~101');
    expect(portalCourseSlug(PortalId.parse('my-lms'), 'OS_2026.a')).toBe(
      'my-lms~OS_2026.a',
    );
    for (const id of ['101', 'a b', 'č/š', '~'])
      expect(CourseSlug.safeParse(portalCourseSlug(canvas, id)).success).toBe(
        true,
      );
  });

  it("goes by a hash for an id of other characters, never another's slug", () => {
    const hashed = portalCourseSlug(canvas, 'a b');
    expect(hashed).toMatch(/^canvas~~[A-Za-z0-9_-]{22}$/);
    expect(portalCourseSlug(canvas, 'a b')).toBe(hashed);
    expect(
      new Set(
        ['a b', 'a  b', '~x', 'x'].map((id) => portalCourseSlug(canvas, id)),
      ).size,
    ).toBe(4);
    // an admin's slug is never one
    expect(Slug.safeParse('canvas~101').success).toBe(false);
  });
});

describe('CourseSlug', () => {
  it("is an admin's slug or a portal course's", () => {
    for (const ok of ['os', 'os-2', 'canvas~101'])
      expect(CourseSlug.safeParse(ok).success).toBe(true);
    for (const bad of ['', 'Os', 'canvas~', 'canvas~a b', '~101', 'a~~short'])
      expect(CourseSlug.safeParse(bad).success).toBe(false);
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
