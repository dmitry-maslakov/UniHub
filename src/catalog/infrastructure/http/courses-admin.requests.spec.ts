import { courseLink, ExternalId, newCourse } from './courses-admin.requests.js';

describe('admin requests', () => {
  it('make a course of a slug and a trimmed name', () => {
    expect(
      newCourse.parse({ slug: 'admin-os', name: ' Operativni sistemi ' }),
    ).toEqual({ slug: 'admin-os', name: 'Operativni sistemi' });
    for (const bad of [
      { slug: 'Not A Slug', name: 'x' },
      { slug: 'ok', name: '  ' },
      // postgres can't keep a NUL: refused here, not a 500 from the insert
      { slug: 'ok', name: 'a\u0000b' },
      { slug: 'ok' },
    ])
      expect(newCourse.safeParse(bad).success).toBe(false);
  });

  it('link to a course for a year, or for none', () => {
    expect(courseLink.parse({ course: 'os', year: 2026 })).toEqual({
      course: 'os',
      year: 2026,
    });
    // no year: one that spans years
    expect(courseLink.parse({ course: 'os' })).toEqual({
      course: 'os',
      year: null,
    });
    for (const bad of [{ course: 'os', year: 1800 }, { year: 2026 }])
      expect(courseLink.safeParse(bad).success).toBe(false);
  });

  it('name a portal course by an id postgres can look up', () => {
    expect(ExternalId.parse('1388')).toBe('1388');
    for (const bad of ['', 'a\u0000b'])
      expect(ExternalId.safeParse(bad).success).toBe(false);
  });
});
