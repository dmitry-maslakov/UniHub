import { PortalId } from '@app/kernel';
import { MisplacedFileError } from '../errors.js';
import { placeFile } from './placement.js';

const portal = PortalId.parse('canvas');
const course = (id: string) => ({ id, ref: { portal, externalId: `c-${id}` } });
const post = (id: string, portalCourseId: string | null) => ({
  id,
  ref: { portal, externalId: `p-${id}` },
  portalCourseId,
});

describe('placeFile', () => {
  it('puts a file in the course it names', () => {
    expect(placeFile(course('a'), null)).toEqual({
      portalCourseId: 'a',
      itemId: null,
    });
  });

  it("puts a post's file in the post's course", () => {
    expect(placeFile(null, post('p', 'a'))).toEqual({
      portalCourseId: 'a',
      itemId: 'p',
    });
    // a post without a course has files without one
    expect(placeFile(null, post('p', null))).toEqual({
      portalCourseId: null,
      itemId: 'p',
    });
  });

  it('takes a file that names its post and the same course', () => {
    expect(placeFile(course('a'), post('p', 'a'))).toEqual({
      portalCourseId: 'a',
      itemId: 'p',
    });
  });

  it("refuses a file whose post isn't in the course it names", () => {
    for (const [named, of] of [
      ['b', 'a'],
      ['b', null],
    ] as const)
      expect(() => placeFile(course(named), post('p', of))).toThrow(
        MisplacedFileError,
      );
    expect(
      new MisplacedFileError(course('b').ref, post('p', 'a').ref),
    ).toMatchObject({
      kind: 'invalid',
      message: "canvas: post p-p isn't in course c-b",
    });
  });

  it('leaves a file that names neither outside any course', () => {
    expect(placeFile(null, null)).toEqual({
      portalCourseId: null,
      itemId: null,
    });
  });
});
