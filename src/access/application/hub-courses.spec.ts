import { NO_INSTANCE, PortalId, type Instance } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import { PortalLinksQuery } from '../../accounts/contracts.js';
import {
  FindCourseQuery,
  ListHubCoursesQuery,
  ListSharedPortalCoursesQuery,
  UnknownCourseError,
  type HubCourseDto,
  type SharedPortalCourseDto,
} from '../../catalog/contracts.js';
import {
  CountCourseReadersQuery,
  ListCourseReadersQuery,
} from '../../identity/contracts.js';
import { HubCourses } from './hub-courses.js';

const [canvas, open, wiki] = ['canvas', 'open', 'wiki'].map((portal) =>
  PortalId.parse(portal),
);
const SITE = 'https://canvas.example.edu' as Instance;

// canvas is read with users' own accounts, open is public, wiki (named by
// nothing) is shared
const modes = new Map([
  [canvas, { mode: 'token' as const, label: 'Canvas' }],
  [open, { mode: 'public' as const, label: 'Course catalog' }],
]);

const courses: HubCourseDto[] = [
  {
    id: 'os-id',
    slug: 'os',
    name: 'Operativni sistemi',
    links: [
      {
        portal: canvas,
        instance: SITE,
        externalId: '1388',
        year: 2026,
        name: 'OS of someone',
      },
      {
        portal: wiki,
        instance: NO_INSTANCE,
        externalId: 'os',
        year: null,
        name: 'OS',
      },
    ],
  },
  { id: 'ar-id', slug: 'ar', name: 'Arhitektura računara', links: [] },
];

const portalCourse = (
  portal: PortalId,
  externalId: string,
  name: string,
  course: SharedPortalCourseDto['course'] = null,
): SharedPortalCourseDto => ({
  id: `${portal}-${externalId}`,
  portal,
  externalId,
  name,
  course,
});

function hub(
  shown: SharedPortalCourseDto[] = [],
  known: string[] = ['os-id', 'ar-id'],
) {
  const queries = new FakeBus([
    [ListHubCoursesQuery, () => courses],
    [ListSharedPortalCoursesQuery, () => shown],
    [
      PortalLinksQuery,
      ({ portals }: PortalLinksQuery) =>
        new Map(
          portals.flatMap((p) => (modes.has(p) ? [[p, modes.get(p)]] : [])),
        ),
    ],
    [CountCourseReadersQuery, () => new Map([['os-id', 2]])],
    [
      FindCourseQuery,
      ({ by }: FindCourseQuery) =>
        known.includes(by.id) ? { id: by.id } : null,
    ],
    [
      ListCourseReadersQuery,
      () => [
        { userId: 'ana', name: 'Ana', email: 'ana@uni.test', banned: false },
      ],
    ],
  ]);
  return { sent: queries.sent, hub: new HubCourses(queries.queries) };
}

describe('HubCourses', () => {
  it("hides the names of token portals' courses from admins", async () => {
    const [os] = (await hub().hub.list()).filter(({ slug }) => slug === 'os');
    expect(os.links.map(({ portal, name }) => [portal, name])).toEqual([
      [canvas, null],
      [wiki, 'OS'],
    ]);
  });

  it("counts each course's readers, by name", async () => {
    const list = await hub().hub.list();
    expect(list.map(({ slug, readers }) => [slug, readers])).toEqual([
      ['ar', 0],
      ['os', 2],
    ]);
  });

  it('names every portal by its label, and a link by its site', async () => {
    const { links } = (await hub().hub.list()).find(
      ({ slug }) => slug === 'os',
    )!;
    expect(links).toEqual([
      expect.objectContaining({
        label: 'Canvas',
        mode: 'token',
        instance: SITE,
      }),
      expect.objectContaining({
        label: 'wiki',
        mode: 'shared',
        instance: null,
      }),
    ]);
  });

  it("lists only shared and public portals' courses to link, by name, diacritics ignored", async () => {
    const shown = [
      portalCourse(wiki, 'b', 'Računarske mreže'),
      portalCourse(canvas, '1', 'Racunarske mreze of someone'),
      portalCourse(open, 'a', 'Racunarska grafika', {
        id: 'os-id',
        slug: 'os',
        name: 'OS',
      }),
      portalCourse(wiki, 'c', 'Fizika'),
    ];
    const found = await hub(shown).hub.linkable({
      q: 'RAČUNAR',
      offset: 0,
      limit: 50,
    });
    expect(found.total).toBe(2);
    expect(
      found.portalCourses.map(({ name, label, mode, course }) => [
        name,
        label,
        mode,
        course?.slug ?? null,
      ]),
    ).toEqual([
      ['Racunarska grafika', 'Course catalog', 'public', 'os'],
      ['Računarske mreže', 'wiki', 'shared', null],
    ]);
    const all = await hub(shown).hub.linkable({ offset: 1, limit: 1 });
    expect(all.total).toBe(3);
    expect(all.portalCourses.map(({ name }) => name)).toEqual([
      'Racunarska grafika',
    ]);
  });

  it('answers a course nobody made as not found', async () => {
    const { hub: h, sent } = hub();
    await expect(h.readers('nope')).rejects.toBeInstanceOf(UnknownCourseError);
    expect(sent.some((m) => m instanceof ListCourseReadersQuery)).toBe(false);
    await expect(h.readers('os-id')).resolves.toEqual([
      { userId: 'ana', name: 'Ana', email: 'ana@uni.test', banned: false },
    ]);
  });
});
