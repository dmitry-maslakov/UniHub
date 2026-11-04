import { courseLink, newCourse } from './requests.js';

// what the bodies add to their values (values.spec): their shape and their
// defaults
describe('admin requests', () => {
  it('make a course of a slug and a name, both of them', () => {
    expect(
      newCourse.parse({ slug: 'admin-os', name: 'Operativni sistemi' }),
    ).toEqual({ slug: 'admin-os', name: 'Operativni sistemi' });
    for (const bad of [{ slug: 'ok' }, { name: 'x' }])
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
    expect(courseLink.safeParse({ year: 2026 }).success).toBe(false);
  });
});
