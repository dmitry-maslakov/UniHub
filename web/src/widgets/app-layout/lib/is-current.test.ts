import { describe, expect, it } from 'vitest';
import { isCurrent } from './is-current';

describe('isCurrent', () => {
  it('marks My courses on the home page and inside a course', () => {
    expect(isCurrent('/', '/')).toBe(true);
    expect(isCurrent('/courses/os', '/')).toBe(true);
    expect(isCurrent('/courses/os/files/f1', '/')).toBe(true);
    expect(isCurrent('/search', '/')).toBe(false);
  });

  it('marks a section on its pages and nowhere else', () => {
    expect(isCurrent('/sources', '/sources')).toBe(true);
    expect(isCurrent('/sources/more', '/sources')).toBe(true);
    expect(isCurrent('/sources-old', '/sources')).toBe(false);
    expect(isCurrent('/', '/sources')).toBe(false);
    expect(isCurrent('/connect', '/search')).toBe(false);
  });
});
