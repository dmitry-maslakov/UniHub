import type { ContentHash } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { MIN_SHARED, suggestions, type Content } from './suggestions.js';

const [h1, h2, h3, h4] = ['h1', 'h2', 'h3', 'h4'].map(sha256);
const in_ = (portalCourseId: string, ...hashes: ContentHash[]): Content[] =>
  hashes.map((hash) => ({ portalCourseId, hash }));
// the user's own portal courses, by the course each is in: pc-a1 and pc-a2
// are both in a
const own = new Map([
  ['pc-a1', 'a'],
  ['pc-a2', 'a'],
  ['pc-b', 'b'],
  ['pc-c', 'c'],
]);

describe('suggestions', () => {
  it(`suggests the course of the user's own that shares the most contents with a pick, at least ${MIN_SHARED}`, () => {
    const contents = [
      ...in_('pick-1', h1, h2, h3),
      ...in_('pc-a1', h1, h2),
      ...in_('pc-b', h1, h2, h3),
      // one alone isn't enough
      ...in_('pick-2', h4),
      ...in_('pc-c', h4),
    ];
    expect(suggestions(contents, ['pick-1', 'pick-2'], own)).toEqual(
      new Map([['pick-1', 'b']]),
    );
  });

  it('counts a content once, however many files hold it, and a course whole', () => {
    // twice in the pick and in b, once each in a's two portal courses
    const contents = [
      ...in_('pick', h1, h1, h2),
      ...in_('pc-b', h1, h1),
      ...in_('pc-a1', h1),
      ...in_('pc-a2', h2),
    ];
    expect(suggestions(contents, ['pick'], own)).toEqual(
      new Map([['pick', 'a']]),
    );
  });

  it('gives a tie to the first course by slug', () => {
    const contents = [
      ...in_('pick', h1, h2),
      ...in_('pc-c', h1, h2),
      ...in_('pc-b', h1, h2),
    ];
    expect(suggestions(contents, ['pick'], own)).toEqual(
      new Map([['pick', 'b']]),
    );
  });

  it("counts no content of a portal course that's neither a pick asked for nor the user's own", () => {
    const contents = [
      ...in_('pick', h1, h2),
      // a course read through the hub's account, and another pick
      ...in_('pc-shared', h1, h2),
      ...in_('other-pick', h1, h2),
    ];
    expect(suggestions(contents, ['pick'], own)).toEqual(new Map());
    expect(suggestions([], ['pick'], own)).toEqual(new Map());
  });
});
