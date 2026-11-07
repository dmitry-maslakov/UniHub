import { describe, expect, it } from 'vitest';
import type { Schemas } from '@/shared/api';
import { ownCourses } from './own-courses';

const course = (
  slug: string,
  name: string,
  ...via: Schemas['PortalCourseResponse']['via'][]
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
});

describe('ownCourses', () => {
  it('keeps the courses read through an account of their own, by name', () => {
    const courses = [
      course('net', 'Mreže 10', 'account'),
      course('pick', 'Picked', 'pick'),
      course('os', 'Mreže 2', 'link', 'account'),
      course('admin', 'Admin', 'link'),
    ];
    expect(ownCourses(courses).map(({ slug }) => slug)).toEqual(['os', 'net']);
  });
});
