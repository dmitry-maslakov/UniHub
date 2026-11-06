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
import {
  ListContainedQuery,
  SearchTextsQuery,
  type ContainedMember,
  type TextHit,
} from '../../processing/contracts.js';
import { CourseSearch } from './course-search.js';
import { NotReadableError } from './errors.js';
import { searchRequest } from './search-request.js';

const processor = PluginName.parse('office-text');
const slides = sha256('%PDF slides');
const notes = sha256('notes');
const secret = sha256('%PDF exam answers');
const labs = sha256('labs.zip');
const code = sha256('int main;');
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
// an archive in os holds code, and the notes again; one in exam the answers
const archives: VisibleContentDto[] = [
  { fileId: 'f5', courseId: 'os-id', hash: labs, name: 'labs.zip', path: 'b' },
  {
    fileId: 'f6',
    courseId: 'exam-id',
    hash: sha256('x.zip'),
    name: 'x.zip',
    path: '',
  },
];
const contained: ContainedMember[] = [
  { container: labs, path: 'lab/main.c', hash: code },
  { container: labs, path: 'lab/notes.txt', hash: notes },
  { container: sha256('x.zip'), path: 'answers.pdf', hash: secret },
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
// then the code, of whatever contents it's asked to look through
function searching(
  reads = ['os-id', 'net-id'],
  withArchives: VisibleContentDto[] = [],
  members = contained,
) {
  const visible = [...files, ...withArchives];
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
        visible.filter((f) => courseIds.includes(f.courseId)),
    ],
    [
      ListContainedQuery,
      ({ hashes }: ListContainedQuery) =>
        members.filter((m) => hashes.includes(m.container)),
    ],
    [
      SearchTextsQuery,
      ({ hashes }: SearchTextsQuery) =>
        [hit(notes, 4), hit(slides, 2), hit(code, 1), hit(secret, 1)].filter(
          (h) => hashes.includes(h.hash),
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
          member: null,
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

  it('asks nothing of catalog or the index for a user who reads no course', async () => {
    const { queries, search } = searching([]);

    expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
      results: [],
    });
    expect(sentOf(queries, ListVisibleContentQuery)).toEqual([]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([]);
  });

  // SearchTexts answers nothing to look through without asking the index
  it('finds nothing in courses without content', async () => {
    const { search } = searching(['empty-id']);

    expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
      results: [],
    });
  });

  it('looks through the members with a text of the archives among them too', async () => {
    const { queries, search } = searching(['os-id', 'net-id'], archives);

    await search.search('ana', request({ q: 'semafor', limit: 5 }));

    expect(sentOf(queries, ListContainedQuery)).toEqual([
      new ListContainedQuery([slides, notes, labs]),
    ]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([
      new SearchTextsQuery('semafor', [slides, notes, labs, code], 5),
    ]);
  });

  it('answers a member as its archive and its path, after the files that hold the same', async () => {
    const { search } = searching(['os-id', 'net-id'], archives);

    const { results } = await search.search('ana', request({ q: 'semafor' }));

    expect(results).toEqual([
      // labs.zip holds the notes too, but as a member: no copy of them
      expect.objectContaining({
        fileId: 'f2',
        member: null,
        sameContentIn: [],
      }),
      expect.objectContaining({ fileId: 'f1', member: null }),
      expect.objectContaining({
        fileId: 'f5',
        name: 'labs.zip',
        member: 'lab/main.c',
        course: 'os',
        sameContentIn: [],
      }),
    ]);
  });

  it("finds no member of an archive in a course the user doesn't read", async () => {
    const { queries, search } = searching(['os-id', 'net-id'], archives);

    const { results } = await search.search('ana', request({ q: 'answers' }));

    expect(results.map(({ fileId }) => fileId)).not.toContain('f6');
    expect(sentOf(queries, SearchTextsQuery)[0].hashes).not.toContain(secret);
  });

  it('answers a member found in several archives, or twice in one, as its first place', async () => {
    const copy = sha256('copy.zip');
    const { search } = searching(
      ['os-id', 'net-id'],
      [
        ...archives,
        {
          fileId: 'f7',
          courseId: 'net-id',
          hash: copy,
          name: 'c.zip',
          path: '',
        },
      ],
      [
        ...contained,
        { container: labs, path: 'old/main.c', hash: code },
        { container: copy, path: 'main.c', hash: code },
      ],
    );

    const { results } = await search.search('ana', request({ q: 'main' }));

    expect(results.at(-1)).toEqual(
      expect.objectContaining({
        fileId: 'f5',
        member: 'lab/main.c',
        sameContentIn: [],
      }),
    );
  });
});
