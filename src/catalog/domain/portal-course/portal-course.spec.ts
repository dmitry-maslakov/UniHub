import { NO_INSTANCE, PortalId } from '@app/kernel';
import { PortalCourse } from './portal-course.js';

const ref = {
  portal: PortalId.parse('moodle'),
  instance: NO_INSTANCE,
  externalId: 'os-101',
};
const props = { name: 'OS', url: null, meta: { semester: 5 } };

describe('PortalCourse', () => {
  it('changes only when the portal sends something new, quietly', () => {
    const course = PortalCourse.restore({ id: 'id-1', ref, props });

    expect(course.sync({ ...props, meta: { semester: 5 } })).toBe(false);
    expect(course.dirty).toBe(false);
    expect(course.sync({ ...props, name: 'OS (advanced)' })).toBe(true);
    expect(course.dirty).toBe(true);
    // nothing downstream reads portal courses
    expect(course.getUncommittedEvents()).toEqual([]);
  });

  it('is written when new', () => {
    const course = PortalCourse.create(ref, props);

    expect(course.dirty).toBe(true);
    expect(course.snapshot).toMatchObject({ ref, props });
  });
});
