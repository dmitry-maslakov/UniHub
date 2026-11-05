import { PluginName, type ContentHash } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { sha256 } from '../../../test/sha256.js';
import {
  FindCourseQuery,
  ListCoursesQuery,
  ListVisibleContentQuery,
  type VisibleContentDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import { SearchTextsQuery, type TextHit } from '../../processing/contracts.js';
import { CourseSearch } from './course-search.js';
import { NotReadableError } from './errors.js';
import { searchRequest } from './search-request.js';

const processor = PluginName.parse('office-text');
const slides = sha256('%PDF slides');
const notes = sha256('notes');
const secret = sha256('%PDF exam answers');
// empty shows no file with content
const courses = ['os', 'net', 'exam', 'empty'].map((slug) => ({
  id: `${slug}-id`,
  slug,
  name: slug,
  portalCourses: [],
}));

// catalog's order: by folder and name; the slides are in os and net both
const files: VisibleContentDto[] = [
  { fileId: 'f1', courseId: 'os-id', hash: slides, name: 'l1.pdf', path: 'a' },
  { fileId: 'f2', courseId: 'os-id', hash: notes, name: 'n.txt', path: 'b' },
  { fileId: 'f3', courseId: 'net-id', hash: slides, name: 'l1.pdf', path: 'c' },
  { fileId: 'f4', courseId: 'exam-id', hash: secret, name: 'x.pdf', path: '' },
];

const hit = (hash: ContentHash, page: number): TextHit => ({
  hash,
  pages: [
    {
      processor,
      version: 2,
      page,
      snippet: { text: `page ${page}`, highlights: [[0, 4]] },
    },
  ],
});

// ana reads os and net; the index finds the notes first, then the slides,
// of whatever contents it's asked to look through
function searching(reads = ['os-id', 'net-id']) {
  const queries = new FakeBus([
    [ReadScopeQuery, () => ({ allows: (id: string) => reads.includes(id) })],
    [ListCoursesQuery, () => courses],
    [
      FindCourseQuery,
      ({ by }: FindCourseQuery) =>
        courses.find((c) => 'slug' in by && c.slug === by.slug) ?? null,
    ],
    [
      ListVisibleContentQuery,
      ({ courseIds }: ListVisibleContentQuery) =>
        files.filter((f) => courseIds.includes(f.courseId)),
    ],
    [
      SearchTextsQuery,
      ({ hashes }: SearchTextsQuery) =>
        [hit(notes, 4), hit(slides, 2), hit(secret, 1)].filter((h) =>
          hashes.includes(h.hash),
        ),
    ],
  ]);
  return { queries, search: new CourseSearch(queries.queries) };
}

const request = (fields: object) => searchRequest.parse(fields);
const sentOf = <T extends object>(
  queries: FakeBus,
  kind: new (...args: never[]) => T,
) => queries.sent.filter((q): q is T => q instanceof kind);

describe('CourseSearch', () => {
  it("looks through the contents of the user's courses' files, each content once", async () => {
    const { queries, search } = searching();

    await search.search('ana', request({ q: 'semafor', limit: 5 }));

    expect(sentOf(queries, ListVisibleContentQuery)).toEqual([
      new ListVisibleContentQuery(['os-id', 'net-id']),
    ]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([
      new SearchTextsQuery('semafor', [slides, notes], 5),
    ]);
  });

  it('answers a content as its first file, in the order found, naming the other files that hold it', async () => {
    const { search } = searching();

    expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
      results: [
        {
          fileId: 'f2',
          name: 'n.txt',
          path: 'b',
          course: 'os',
          pages: [
            {
              page: 4,
              processor,
              snippet: { text: 'page 4', highlights: [[0, 4]] },
            },
          ],
          sameContentIn: [],
        },
        expect.objectContaining({
          fileId: 'f1',
          course: 'os',
          sameContentIn: ['f3'],
        }),
      ],
    });
  });

  it('searches only the course named, found as the course routes find it, which the user must read', async () => {
    const { queries, search } = searching();

    const { results } = await search.search(
      'ana',
      request({ q: 'semafor', course: 'net' }),
    );

    expect(sentOf(queries, ListCoursesQuery)).toEqual([]);
    expect(sentOf(queries, ListVisibleContentQuery)).toEqual([
      new ListVisibleContentQuery(['net-id']),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ fileId: 'f3', course: 'net' }),
    ]);
    for (const course of ['exam', 'nope'])
      await expect(
        search.search('ana', request({ q: 'semafor', course })),
      ).rejects.toThrowError(new NotReadableError('course'));
  });

  it('asks nothing of the index for a user who reads no course, or courses without content', async () => {
    for (const reads of [[], ['empty-id']]) {
      const { queries, search } = searching(reads);

      expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
        results: [],
      });
      expect(sentOf(queries, SearchTextsQuery)).toEqual([]);
    }
  });
});
