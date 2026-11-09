import { PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { sha256 } from '../../../test/sha256.js';
import { ViewingAccountsQuery } from '../../accounts/contracts.js';
import {
  ListCoursesQuery,
  ListVisibleContentQuery,
  type VisibleContentDto,
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
const file = (
  slug: string,
  name: string,
  content = name,
): VisibleContentDto => ({
  fileId: `${slug}-${name}`,
  courseId: `${slug}-id`,
  portalCourseId: `${slug}-pc`,
  hash: sha256(content),
  name,
  mime: null,
  path: '',
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
      ListVisibleContentQuery,
      ({ portalCourseIds }: ListVisibleContentQuery) =>
        files.filter(({ portalCourseId }) =>
          portalCourseIds?.includes(portalCourseId),
        ),
    ],
    [ListWaitingQuery, waitingFor],
  ]);
  return new CourseProcessing(queries.queries);
}

describe('CourseProcessing', () => {
  it("counts a course's distinct contents and what waits, by kind", async () => {
    expect(
      await processing(['os-id']).of('ana', CourseSlug.parse('os')),
    ).toEqual({
      // a.pdf (also as copy.pdf), b.pdf, notes.txt
      total: 3,
      // only a.pdf's text is made, and its pictures wait: nothing is done
      done: 0,
      waiting: { text: 2, pictures: 2 },
    });
  });

  it('reads a course the user may not as one that is not there', async () => {
    await expect(
      processing(['net-id']).of('bob', CourseSlug.parse('os')),
    ).rejects.toThrow(NotReadableError);
  });

  it('tells each course in the list what waits, with one read for all', async () => {
    const reader = processing(['os-id', 'net-id']);
    expect((await reader.listing('ana')).map((c) => c.processing)).toEqual([
      { text: 2, pictures: 2 },
      { text: 1, pictures: 1 },
    ]);
  });

  it('leaves `processing` out of a course nothing waits in', async () => {
    const [os] = await processing(['os-id']).listing('ana');
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
        [ListVisibleContentQuery, () => []],
      ]).queries,
    );
    expect((await none.listing('ana'))[0]).not.toHaveProperty('processing');
  });
});
