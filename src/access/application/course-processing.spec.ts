import { Logger } from '@nestjs/common';
import { PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { sha256 } from '../../../test/sha256.js';
import { ViewingAccountsQuery } from '../../accounts/contracts.js';
import {
  ListCoursesQuery,
  ListVisibleKeysQuery,
  type VisibleKeyDto,
} from '../../catalog/contracts.js';
import { ReadScopeQuery } from '../../identity/contracts.js';
import { ListWaitingQuery } from '../../processing/contracts.js';
import { CourseProcessing } from './course-processing.js';
import { NotReadableError } from './errors.js';
import { CourseSlug } from '../../catalog/contracts.js';

const portal = PortalId.parse('canvas');
const course = (slug: string) => ({
  id: `${slug}-id`,
  slug,
  name: slug,
  portalCourses: [
    { id: `${slug}-pc`, portal, externalId: slug, name: slug, year: null },
  ],
});
const file = (slug: string, name: string, content = name): VisibleKeyDto => ({
  portalCourseId: `${slug}-pc`,
  hash: sha256(content),
  name,
  mime: null,
});
const files = [
  file('os', 'a.pdf'),
  // the same bytes again in another file
  file('os', 'copy.pdf', 'a.pdf'),
  file('os', 'b.pdf'),
  file('os', 'notes.txt'),
  file('net', 'c.pdf'),
];

// Processing's answer, as its rule gives it for these files: .pdf and .txt
// wait for a text, .pdf for pictures too, and a.pdf's text (and its copy's) is made already.
const waitingFor = ({ files }: ListWaitingQuery) =>
  files.flatMap(({ hash, name }) => {
    const text = hash !== sha256('a.pdf') && /\.(pdf|txt)$/.test(name);
    const pictures = name.endsWith('.pdf');
    return text || pictures ? [{ hash, text, pictures }] : [];
  });

// the user reads `reads`
function processing(reads: string[]) {
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
        ['os', 'net']
          .map(course)
          .filter(({ id }) => viewers.shared.courses?.includes(id)),
    ],
    [
      ListVisibleKeysQuery,
      ({ portalCourseIds }: ListVisibleKeysQuery) =>
        files.filter(({ portalCourseId }) =>
          portalCourseIds?.includes(portalCourseId),
        ),
    ],
    [ListWaitingQuery, waitingFor],
  ]);
  return { reader: new CourseProcessing(queries.queries), queries };
}

describe('CourseProcessing', () => {
  it("counts a course's distinct contents and what waits, by kind", async () => {
    expect(
      await processing(['os-id']).reader.of('ana', CourseSlug.parse('os')),
    ).toEqual({
      // a.pdf (also as copy.pdf), b.pdf, notes.txt
      total: 3,
      waiting: { text: 2, pictures: 2 },
    });
  });

  it('reads a course the user may not as one that is not there', async () => {
    await expect(
      processing(['net-id']).reader.of('bob', CourseSlug.parse('os')),
    ).rejects.toThrow(NotReadableError);
  });

  it('tells each course in the list what waits, with one read for all', async () => {
    const { reader, queries } = processing(['os-id', 'net-id']);
    expect((await reader.listing('ana')).map((c) => c.processing)).toEqual([
      { text: 2, pictures: 2 },
      { text: 1, pictures: 1 },
    ]);
    expect(
      queries.sent.filter((q) => q instanceof ListVisibleKeysQuery),
    ).toHaveLength(1);
    expect(
      queries.sent.filter((q) => q instanceof ListWaitingQuery),
    ).toHaveLength(1);
  });

  it('leaves `processing` out of a course nothing waits in', async () => {
    const [os] = await processing(['os-id']).reader.listing('ana');
    expect(os).toHaveProperty('processing');
    const none = new CourseProcessing(
      new FakeBus([
        [ReadScopeQuery, () => ({ granted: ['os-id'], ownAccounts: true })],
        [
          ViewingAccountsQuery,
          () => ({
            portals: [],
            accounts: [],
            picks: { portals: [], courses: [], into: new Map() },
          }),
        ],
        [ListCoursesQuery, () => [course('os')]],
        [ListVisibleKeysQuery, () => []],
      ]).queries,
    );
    expect((await none.listing('ana'))[0]).not.toHaveProperty('processing');
  });

  it('counts a course whose files are all read as nothing waiting', async () => {
    const reader = new CourseProcessing(
      new FakeBus([
        [ReadScopeQuery, () => ({ granted: ['os-id'], ownAccounts: true })],
        [
          ViewingAccountsQuery,
          () => ({
            portals: [],
            accounts: [],
            picks: { portals: [], courses: [], into: new Map() },
          }),
        ],
        [ListCoursesQuery, () => [course('os')]],
        [ListVisibleKeysQuery, () => [file('os', 'a.pdf')]],
        [ListWaitingQuery, () => []],
      ]).queries,
    );
    expect(await reader.of('ana', CourseSlug.parse('os'))).toEqual({
      total: 1,
      waiting: { text: 0, pictures: 0 },
    });
    expect((await reader.listing('ana'))[0]).not.toHaveProperty('processing');
  });

  it('lists the courses with no `processing` when the read fails', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockReturnValue();
    const { reader, queries } = processing(['os-id']);
    queries.execute = async (q: object) => {
      if (q instanceof ListVisibleKeysQuery) throw new Error('db away');
      return FakeBus.prototype.execute.call(queries, q);
    };
    const listed = await reader.listing('ana');
    expect(listed.map((c) => c.slug)).toEqual(['os']);
    expect(listed[0]).not.toHaveProperty('processing');
  });
});
