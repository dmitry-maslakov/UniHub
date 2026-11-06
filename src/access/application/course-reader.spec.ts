import { MediaType, PluginName, PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { InMemoryBlobs } from '../../../test/in-memory-blobs.js';
import { sha256 } from '../../../test/sha256.js';
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
  FindMemberQuery,
  GetTextPageQuery,
  ListMembersQuery,
  ListTextsQuery,
} from '../../processing/contracts.js';
import { CourseReader } from './course-reader.js';
import { NotReadableError } from './errors.js';

const portal = PortalId.parse('canvas');
const content = '%PDF slides of f1';
const hash = sha256(content);
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
// f1 holds an archive too, with this member kept
const code = 'int main;';
const cMime = MediaType.parse('text/x-c');
const main = {
  path: 'lab/main.c',
  size: code.length,
  mime: cMime,
  leftOut: null,
  texts: [text],
};

// ana reads os; catalog has os and net, three files and a text of f1
function reader() {
  const queries = new FakeBus([
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
    [ListMembersQuery, () => [main]],
    [
      FindMemberQuery,
      ({ path }: FindMemberQuery) =>
        path === main.path ? { hash: sha256(code), mime: cMime } : null,
    ],
    [
      GetTextPageQuery,
      ({ page }: GetTextPageQuery) =>
        page <= text.pages ? { ...text, page, text: `page ${page}` } : null,
    ],
  ]);
  const blobs = new InMemoryBlobs({ holding: [content, code] });
  return { queries, reader: new CourseReader(queries.queries, blobs) };
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
    expect(queries.sent).toContainEqual(new ListCourseFilesQuery(os.id, 10, 5));
    for (const slug of ['net', 'nope'])
      await expect(r.items('ana', Slug.parse(slug), page)).rejects.toThrowError(
        new NotReadableError('course'),
      );
  });

  it('asks for a file and the scope at once', async () => {
    const { reader: r, queries } = reader();
    const reading = r.file('ana', 'f1');
    // both asked before either answered
    expect(queries.sent.map((q) => q.constructor)).toEqual([
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
    expect(await r.text('ana', 'f1', { page: 2 })).toEqual(
      expect.objectContaining({ page: 2, text: 'page 2' }),
    );
    await expect(r.text('ana', 'f1', { page: 4 })).rejects.toThrowError(
      new NotReadableError('page'),
    );
    await expect(r.text('ana', 'f3', { page: 1 })).rejects.toThrowError(
      new NotReadableError('file'),
    );

    const { stream, name } = await r.content('ana', 'f1');
    expect(name).toBe('f1.pdf');
    expect((await stream.toArray()).join('')).toBe(content);
  });

  it('pages the members of a file it may read', async () => {
    const { reader: r, queries } = reader();

    expect(await r.members('ana', 'f1', { offset: 5, limit: 10 })).toEqual([
      main,
    ]);
    expect(queries.sent).toContainEqual(new ListMembersQuery(hash, 5, 10));
    await expect(
      r.members('ana', 'f2', { offset: 0, limit: 10 }),
    ).rejects.toThrowError(new NotReadableError('file'));
  });

  it('reads a member kept in a file it may read, by its path', async () => {
    const { reader: r, queries } = reader();

    expect(
      await r.text('ana', 'f1', { page: 1, member: 'lab/main.c' }),
    ).toEqual(expect.objectContaining({ text: 'page 1' }));
    expect(queries.sent).toContainEqual(
      new GetTextPageQuery(sha256(code), 1, undefined),
    );
    const { stream, name, mime } = await r.content('ana', 'f1', 'lab/main.c');
    expect({ name, mime }).toEqual({ name: 'main.c', mime: cMime });
    expect((await stream.toArray()).join('')).toBe(code);
  });

  it("answers the same for a member that isn't kept and a file it may not read", async () => {
    const { reader: r, queries } = reader();

    await expect(
      r.text('ana', 'f1', { page: 1, member: 'lab/gone.c' }),
    ).rejects.toThrowError(new NotReadableError('member'));
    await expect(r.content('ana', 'f2', 'lab/main.c')).rejects.toThrowError(
      new NotReadableError('file'),
    );
    expect(
      queries.sent.filter((q) => q instanceof FindMemberQuery),
    ).toHaveLength(1);
  });
});
