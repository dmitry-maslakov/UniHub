import { describe, expect, it } from 'vitest';
import type { Schemas } from '@/shared/api';
import { linkedCourse, ownCourses } from './own-courses';

type Via = Schemas['PortalCourseResponse']['via'];

const course = (
  slug: string,
  name: string,
  ...via: Via[]
): Schemas['CourseResponse'] => ({
  slug,
  name,
  sources: [],
  portalCourses: via.map((v) => ({
    portal: 'lms',
    externalId: slug,
    name,
    url: null,
    year: null,
    via: v,
  })),
  hidden: false,
});

// the course with catalog's os in it too
const holding = (held: Schemas['CourseResponse']) => ({
  ...held,
  portalCourses: [
    ...held.portalCourses,
    {
      portal: 'catalog',
      externalId: 'os',
      name: 'OS',
      url: null,
      year: null,
      via: 'public' as Via,
    },
  ],
});

describe('ownCourses', () => {
  it('keeps the courses read through an account of their own, by name', () => {
    const courses = [
      course('net', 'Mreže 10', 'account'),
      course('pick', 'Picked', 'public'),
      course('os', 'Mreže 2', 'link', 'account'),
      course('admin', 'Admin', 'link'),
    ];
    expect(ownCourses(courses).map(({ slug }) => slug)).toEqual(['os', 'net']);
  });
});

describe('linkedCourse', () => {
  it('finds the course an admin linked a pick to', () => {
    const algo = holding(course('algo', 'Algorithms', 'link'));
    expect(
      linkedCourse([course('net', 'Net', 'account'), algo], 'catalog', 'os'),
    ).toBe(algo);
    // a course an admin made of the pick alone
    const alone = { ...holding(course('os', 'OS')), slug: 'operating' };
    expect(linkedCourse([alone], 'catalog', 'os')).toBe(alone);
  });

  it('finds none for a pick on its own, with a course of her own, or not there', () => {
    const own = { ...holding(course('os', 'OS')), slug: 'catalog~os' };
    expect(linkedCourse([own], 'catalog', 'os')).toBeUndefined();
    expect(
      linkedCourse([holding(course('net', 'Net', 'account'))], 'catalog', 'os'),
    ).toBeUndefined();
    expect(
      linkedCourse([course('net', 'Net', 'account')], 'catalog', 'os'),
    ).toBeUndefined();
  });
});
