import { Readable } from 'node:stream';
import { ContentHash, MediaType, PluginName, PortalId } from '@app/kernel';
import {
  FindCourseQuery,
  GetCourseFileQuery,
  ListCourseFilesQuery,
  ListCourseItemsQuery,
  ListCoursesQuery,
  Slug,
  type CourseFileDto,
  type CourseRef,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import {
  GetTextPageQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import type { BlobStore } from '../../storage/contracts.js';
import { FakeQueries } from './access.fakes.js';
import { CourseReader } from './course-reader.js';
import { NotReadableError } from './errors.js';

const portal = PortalId.parse('canvas');
const hash = ContentHash.parse('a'.repeat(64));
const os: CourseRef = { id: 'os-id', slug: 'os', name: 'OS' };
const net: CourseRef = { id: 'net-id', slug: 'net', name: 'Networks' };

const file = (id: string, courseId: string, content = true): CourseFileDto => ({
  id,
  courseId,
  portal,
  externalId: `x-${id}`,
  portalCourseId: 'pc',
  itemId: null,
  name: `${id}.pdf`,
  path: '',
  url: null,
  size: 3,
  mime: MediaType.parse('application/pdf'),
  contentHash: content ? hash : null,
  removed: false,
});
const files = [file('f1', os.id), file('f2', net.id), file('f3', os.id, false)];
const text = {
  processor: PluginName.parse('office-text'),
  version: 2,
  pages: 3,
};

// ana reads os; catalog has os and net, three files and a text of f1
function reader() {
  const queries = new FakeQueries([
    [ReadScopeQuery, () => ({ allows: (id: string) => id === os.id })],
    [
      ListCoursesQuery,
      () =>
        [os, net].map((c) => ({
          ...c,
          portalCourses: [
            { id: 'pc', portal, externalId: 'c1', name: c.name, year: 2026 },
          ],
        })),
    ],
    [
      FindCourseQuery,
      ({ by }: FindCourseQuery) =>
        [os, net].find((c) => 'slug' in by && c.slug === by.slug) ?? null,
    ],
    [ListCourseItemsQuery, () => []],
    [ListCourseFilesQuery, () => [files[0]]],
    [
      GetCourseFileQuery,
      ({ fileId }: GetCourseFileQuery) =>
        files.find((f) => f.id === fileId) ?? null,
    ],
    [ListTextsQuery, () => [text]],
    [
      GetTextPageQuery,
      ({ page }: GetTextPageQuery) =>
        page <= text.pages ? { ...text, page, text: `page ${page}` } : null,
    ],
  ]);
  const blobs = {
    get: async (h: ContentHash) => Readable.from([h]),
  } as unknown as BlobStore;
  return { queries, reader: new CourseReader(queries.bus, blobs) };
}

describe('CourseReader', () => {
  it("lists the courses the user's scope allows, without catalog's ids", async () => {
    const { reader: r } = reader();
    expect(await r.courses('ana')).toEqual([
      {
        slug: 'os',
        name: 'OS',
        portalCourses: [{ portal, name: 'OS', year: 2026 }],
      },
    ]);
  });

  it('pages a course it may read, and finds none of the others', async () => {
    const { reader: r, queries } = reader();
    const page = { offset: 10, limit: 5 };

    expect(await r.files('ana', Slug.parse('os'), page)).toEqual([
      expect.objectContaining({ id: 'f1', hasContent: true }),
    ]);
    expect(queries.asked).toContainEqual(
      new ListCourseFilesQuery(os.id, 10, 5),
    );
    for (const slug of ['net', 'nope'])
      await expect(r.items('ana', Slug.parse(slug), page)).rejects.toThrowError(
        new NotReadableError('course'),
      );
  });

  it('asks for a file and the scope at once', async () => {
    const { reader: r, queries } = reader();
    const reading = r.file('ana', 'f1');
    // both asked before either answered
    expect(queries.asked.map((q) => q.constructor)).toEqual([
      GetCourseFileQuery,
      ReadScopeQuery,
    ]);
    expect(await reading).toEqual(
      expect.objectContaining({ id: 'f1', texts: [text] }),
    );
  });

  it("answers the same for a file of someone else's course and none", async () => {
    const { reader: r } = reader();
    for (const id of ['f2', 'missing']) {
      await expect(r.file('ana', id)).rejects.toThrowError(
        new NotReadableError('file'),
      );
      await expect(r.content('ana', id)).rejects.toBeInstanceOf(
        NotReadableError,
      );
    }
  });

  it('reads text and content only of a file that has some', async () => {
    const { reader: r } = reader();
    expect(await r.text('ana', 'f1', 2)).toEqual(
      expect.objectContaining({ page: 2, text: 'page 2' }),
    );
    await expect(r.text('ana', 'f1', 4)).rejects.toThrowError(
      new NotReadableError('page'),
    );
    await expect(r.text('ana', 'f3', 1)).rejects.toThrowError(
      new NotReadableError('file'),
    );

    const { stream, name } = await r.content('ana', 'f1');
    expect(name).toBe('f1.pdf');
    expect((await stream.toArray()).join('')).toBe(hash);
  });
});
