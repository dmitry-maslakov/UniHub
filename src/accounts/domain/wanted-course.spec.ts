import { GRACE_DAYS, WantedCourse } from './wanted-course.js';

const now = new Date('2026-11-07T12:00:00Z');
const at = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe('WantedCourse', () => {
  it('is wanted for good while someone picks it', () => {
    const picked = new WantedCourse('os');
    expect(picked.until).toBeNull();
    expect(picked.picked(true, now)).toBe(picked);
    expect(picked.goneAt(at(1000))).toBe(false);
  });

  it(`is wanted ${GRACE_DAYS} days more once no one does, then no more`, () => {
    const left = new WantedCourse('os').picked(false, now);
    expect(left.until).toEqual(at(GRACE_DAYS));
    expect(left.goneAt(at(GRACE_DAYS - 1))).toBe(false);
    expect(left.goneAt(at(GRACE_DAYS))).toBe(true);
  });

  it('keeps the grace running from when the last pick went, not from each look at it', () => {
    const left = new WantedCourse('os').picked(false, now);
    expect(left.picked(false, at(3))).toBe(left);
  });

  it('is wanted for good again once someone picks it within its grace', () => {
    const left = new WantedCourse('os', at(5));
    expect(left.picked(true, now)).toEqual(new WantedCourse('os'));
  });
});
