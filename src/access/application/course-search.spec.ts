import { PluginName, PortalId, type ContentHash } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { sha256 } from '../../../test/sha256.js';
import { ViewingAccountsQuery } from '../../accounts/contracts.js';
import {
  ListCoursesQuery,
  ListVisibleContentQuery,
  ListVisibleItemsQuery,
  type Viewers,
  type VisibleContentDto,
  type VisibleItemDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import {
  ListContainedQuery,
  SearchTextsQuery,
  type ContainedMember,
  type RecordMatch,
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
// empty shows no file with content; each is one portal course, <slug>-pc
const portal = PortalId.parse('canvas');
const courses = ['os', 'net', 'exam', 'empty'].map((slug) => ({
  id: `${slug}-id`,
  slug,
  name: slug,
  portalCourses: [
    { id: `${slug}-pc`, portal, externalId: slug, name: slug, year: null },
  ],
}));
// what the viewers of a user who reads these courses are
const viewersReading = (reads: string[]): Viewers => ({
  accounts: [],
  shared: { courses: reads, except: [] },
  picks: { portals: [], courses: [] },
});
// catalog's cut, as the fakes make it: the courses the viewers read, and
// of those the portal courses asked for
const cut =
  ({ shared }: Viewers, portalCourseIds: readonly string[] | null) =>
  ({ courseId }: { courseId: string }) =>
    (shared.courses?.includes(courseId) ?? true) &&
    (!portalCourseIds ||
      portalCourseIds.includes(courseId.replace(/-id$/, '-pc')));

// catalog's order: by folder and name; the slides are in os and net both
const files: VisibleContentDto[] = [
  {
    fileId: 'f1',
    courseId: 'os-id',
    portalCourseId: 'os-pc',
    hash: slides,
    name: 'l1.pdf',
    mime: null,
    path: 'a',
  },
  {
    fileId: 'f2',
    courseId: 'os-id',
    portalCourseId: 'os-pc',
    hash: notes,
    name: 'n.txt',
    mime: null,
    path: 'b',
  },
  {
    fileId: 'f3',
    courseId: 'net-id',
    portalCourseId: 'net-pc',
    hash: slides,
    name: 'l1.pdf',
    mime: null,
    path: 'c',
  },
  {
    fileId: 'f4',
    courseId: 'exam-id',
    portalCourseId: 'exam-pc',
    hash: secret,
    name: 'x.pdf',
    mime: null,
    path: '',
  },
];
// an archive in os holds code, and the notes again; one in exam the answers
const archives: VisibleContentDto[] = [
  {
    fileId: 'f5',
    courseId: 'os-id',
    portalCourseId: 'os-pc',
    hash: labs,
    name: 'labs.zip',
    mime: null,
    path: 'b',
  },
  {
    fileId: 'f6',
    courseId: 'exam-id',
    portalCourseId: 'exam-pc',
    hash: sha256('x.zip'),
    name: 'x.zip',
    mime: null,
    path: '',
  },
];
const contained: ContainedMember[] = [
  { container: labs, path: 'lab/main.c', hash: code },
  { container: labs, path: 'lab/notes.txt', hash: notes },
  { container: sha256('x.zip'), path: 'answers.pdf', hash: secret },
];

// posts: one in os, one in exam
const posts: VisibleItemDto[] = [
  {
    itemId: 'p1',
    courseId: 'os-id',
    kind: 'announcement',
    title: 'Exam',
    url: 'https://portal.example/p1',
    publishedAt: new Date('2026-10-01T09:00:00Z'),
  },
  {
    itemId: 'p2',
    courseId: 'exam-id',
    kind: 'page',
    title: 'Answers',
    url: null,
    publishedAt: null,
  },
];
// a post's chunks go by a hash of its own
const postHash = sha256('post:p1');

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
  records: [],
});
const snippet = (text: string) => ({ text, highlights: [] });
const match = (
  kind: RecordMatch['kind'],
  record: string,
  member: string | null = null,
): RecordMatch => ({ kind, record, member, snippet: snippet(record) });
// a content found by records alone, no page of it
const byRecords = (hash: ContentHash, ...records: RecordMatch[]): TextHit => ({
  hash,
  pages: [],
  records,
});

// ana reads os and net; the index finds the notes first, then the slides,
// then the code, of whatever contents it's asked to look through, unless a
// spec says what it finds
function searching(
  reads = ['os-id', 'net-id'],
  withArchives: VisibleContentDto[] = [],
  members = contained,
  found?: TextHit[],
) {
  const visible = [...files, ...withArchives];
  const queries = new FakeBus([
    [ReadScopeQuery, () => ({ granted: reads, ownAccounts: true })],
    [
      ViewingAccountsQuery,
      () => ({
        portals: [],
        accounts: [],
        picks: { portals: [], courses: [], into: new Map() },
      }),
    ],
    [
      ListCoursesQuery,
      ({ viewers }: ListCoursesQuery) =>
        courses.filter(({ id }) => cut(viewers, null)({ courseId: id })),
    ],
    [
      ListVisibleContentQuery,
      ({ viewers, portalCourseIds }: ListVisibleContentQuery) =>
        visible.filter(cut(viewers, portalCourseIds)),
    ],
    [
      ListVisibleItemsQuery,
      ({ viewers, portalCourseIds }: ListVisibleItemsQuery) =>
        posts.filter(cut(viewers, portalCourseIds)),
    ],
    [
      ListContainedQuery,
      ({ hashes }: ListContainedQuery) =>
        members.filter((m) => hashes.includes(m.container)),
    ],
    [
      SearchTextsQuery,
      ({ among }: SearchTextsQuery) =>
        found ??
        [hit(notes, 4), hit(slides, 2), hit(code, 1), hit(secret, 1)].filter(
          (h) => among.contents.includes(h.hash),
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
  it("looks through the contents of the user's courses' files, each once, their names, and their posts", async () => {
    const { queries, search } = searching();

    await search.search('ana', request({ q: 'semafor', limit: 5 }));

    // the user's viewers, in every course they read
    const viewers = viewersReading(['os-id', 'net-id']);
    expect(sentOf(queries, ListVisibleContentQuery)).toEqual([
      new ListVisibleContentQuery(viewers, null),
    ]);
    expect(sentOf(queries, ListVisibleItemsQuery)).toEqual([
      new ListVisibleItemsQuery(viewers, null),
    ]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([
      new SearchTextsQuery(
        'semafor',
        {
          contents: [slides, notes],
          posts: ['p1'],
          files: ['f1', 'f2', 'f3'],
          archives: [slides, notes],
        },
        5,
      ),
    ]);
  });

  it('gives the index only the kind asked for', async () => {
    const { queries, search } = searching();

    await search.search('ana', request({ q: 'semafor', type: 'posts' }));
    await search.search('ana', request({ q: 'semafor', type: 'files' }));

    const [byPosts, byFiles] = sentOf(queries, SearchTextsQuery).map(
      ({ among }) => among,
    );
    expect(byPosts).toEqual({
      contents: [],
      posts: ['p1'],
      files: [],
      archives: [],
    });
    expect(byFiles).toEqual({
      contents: [slides, notes],
      posts: [],
      files: ['f1', 'f2', 'f3'],
      archives: [slides, notes],
    });
  });

  it('answers a content as its first file, in the order found, naming the other files that hold it', async () => {
    const { search } = searching();

    expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
      results: [
        {
          type: 'file',
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
          matchedName: null,
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

    expect(sentOf(queries, ListVisibleContentQuery)).toEqual([
      new ListVisibleContentQuery(viewersReading(['os-id', 'net-id']), [
        'net-pc',
      ]),
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
    expect(sentOf(queries, ListVisibleItemsQuery)).toEqual([]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([]);
  });

  it('asks nothing of processing in courses with neither files nor posts', async () => {
    const { queries, search } = searching(['empty-id']);

    expect(await search.search('ana', request({ q: 'semafor' }))).toEqual({
      results: [],
    });
    expect(sentOf(queries, ListContainedQuery)).toEqual([]);
    expect(sentOf(queries, SearchTextsQuery)).toEqual([]);
  });

  it('looks through the members with a text of the archives among them too', async () => {
    const { queries, search } = searching(['os-id', 'net-id'], archives);

    await search.search('ana', request({ q: 'semafor', limit: 5 }));

    expect(sentOf(queries, ListContainedQuery)).toEqual([
      new ListContainedQuery([slides, notes, labs]),
    ]);
    expect(sentOf(queries, SearchTextsQuery)[0].among).toMatchObject({
      contents: [slides, notes, labs, code],
      files: ['f1', 'f2', 'f3', 'f5'],
      archives: [slides, notes, labs],
    });
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
        type: 'member',
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

    expect(results).not.toContainEqual(
      expect.objectContaining({ fileId: 'f6' }),
    );
    expect(sentOf(queries, SearchTextsQuery)[0].among).toMatchObject({
      contents: expect.not.arrayContaining([secret]),
      files: expect.not.arrayContaining(['f6']),
      archives: expect.not.arrayContaining([sha256('x.zip')]),
    });
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
          portalCourseId: 'net-pc',
          hash: copy,
          name: 'c.zip',
          mime: null,
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

  it('answers a post found by its text as the post, in its course', async () => {
    const { search } = searching(['os-id', 'net-id'], [], contained, [
      byRecords(postHash, match('post', 'p1')),
    ]);

    expect(await search.search('ana', request({ q: 'exam' }))).toEqual({
      results: [
        {
          type: 'post',
          itemId: 'p1',
          kind: 'announcement',
          title: 'Exam',
          url: 'https://portal.example/p1',
          publishedAt: new Date('2026-10-01T09:00:00Z'),
          course: 'os',
          snippet: snippet('p1'),
        },
      ],
    });
  });

  // found by f3's name, a copy of the slides in net: f3 is the result, its
  // pages the slides', with f1 the other file holding them
  it('answers a file found by its name as that file, with its pages and the other files holding the same', async () => {
    const { search } = searching(['os-id', 'net-id'], [], contained, [
      { ...hit(slides, 2), records: [match('file', 'f3')] },
    ]);

    const { results } = await search.search('ana', request({ q: 'l1' }));

    expect(results).toEqual([
      expect.objectContaining({
        type: 'file',
        fileId: 'f3',
        course: 'net',
        pages: [expect.objectContaining({ page: 2 })],
        matchedName: snippet('f3'),
        sameContentIn: ['f1'],
      }),
    ]);
  });

  // an image, a zip: nothing but its name
  it('answers a file found by its name alone, without pages', async () => {
    const { search } = searching(['os-id', 'net-id'], archives, contained, [
      byRecords(labs, match('file', 'f5')),
    ]);

    const { results } = await search.search('ana', request({ q: 'labs' }));

    expect(results).toEqual([
      expect.objectContaining({ fileId: 'f5', member: null, pages: [] }),
    ]);
  });

  // with no text, so in no place of its own: by its archive alone
  it('answers a member found by its path as its archive and that path', async () => {
    const image = sha256('PNG');
    const { search } = searching(['os-id', 'net-id'], archives, contained, [
      byRecords(image, match('tree', labs, 'lab/diagram.png')),
    ]);

    const { results } = await search.search('ana', request({ q: 'diagram' }));

    expect(results).toEqual([
      expect.objectContaining({
        type: 'member',
        fileId: 'f5',
        name: 'labs.zip',
        member: 'lab/diagram.png',
        matchedName: snippet(labs),
        pages: [],
      }),
    ]);
  });

  // the index a step behind catalog: a name of a file given other content
  // since, a post or an archive no course of the user's shows
  it("answers nothing for a record that isn't where the user reads it, nor a content with nothing else found", async () => {
    const { search } = searching(['os-id', 'net-id'], [], contained, [
      byRecords(notes, match('file', 'f1')),
      byRecords(
        sha256('x'),
        match('post', 'p2'),
        match('tree', sha256('x.zip'), 'a'),
      ),
      { ...hit(notes, 4), records: [match('file', 'f1')] },
    ]);

    const { results } = await search.search('ana', request({ q: 'notes' }));

    expect(results).toEqual([
      expect.objectContaining({ fileId: 'f2', matchedName: null }),
    ]);
  });

  it('answers at most the limit, however many results a hit makes', async () => {
    const { search } = searching(['os-id', 'net-id'], [], contained, [
      { ...hit(slides, 2), records: [match('post', 'p1')] },
    ]);

    const { results } = await search.search(
      'ana',
      request({ q: 'exam', limit: 1 }),
    );

    expect(results).toEqual([expect.objectContaining({ fileId: 'f1' })]);
  });
});
