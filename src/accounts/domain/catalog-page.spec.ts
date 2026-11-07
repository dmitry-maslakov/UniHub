import {
  browse,
  nameHas,
  NEW_DAYS,
  type CatalogCourse,
} from './catalog-page.js';

const now = new Date('2026-11-07T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const course = (
  externalId: string,
  name: string,
  since = daysAgo(100),
): CatalogCourse => ({
  id: `pc-${externalId}`,
  externalId,
  name,
  url: `https://courses.example.edu/${externalId}`,
  since,
});

const catalog = [
  course('3', 'Računarske mreže'),
  course('1', 'Operativni sistemi', daysAgo(NEW_DAYS - 1)),
  course('10', 'Đački servis'),
  course('2', 'Arhitektura računara 2'),
  course('20', 'Arhitektura računara 10'),
  course('4', 'Базе података'),
];
const all = { offset: 0, limit: 50 };

describe('nameHas', () => {
  it('finds words whatever their case or diacritics', () => {
    for (const q of ['racunar', 'RAČUNAR', 'Računar', 'mreze'])
      expect(nameHas('Računarske mreže', q), q).toBe(true);
    expect(nameHas('Đački servis', 'dacki')).toBe(true);
    expect(nameHas('Базе података', 'БАЗЕ')).toBe(true);
  });

  it('finds them in the name, letters as typed', () => {
    expect(nameHas('Računarske mreže', 'mreže računar')).toBe(false);
    expect(nameHas('Računarske mreže', 'sistemi')).toBe(false);
    // composed or not, a letter is one
    expect(nameHas('Računarske', 'Račun')).toBe(true);
  });
});

describe('browse', () => {
  it('lists the catalog by name, numbers by value, with how many there are', () => {
    const page = browse(catalog, all, new Set(), now);
    expect(page.total).toBe(6);
    expect(page.courses.map((c) => c.name)).toEqual([
      'Arhitektura računara 2',
      'Arhitektura računara 10',
      'Đački servis',
      'Operativni sistemi',
      'Računarske mreže',
      'Базе података',
    ]);
  });

  it('marks the courses the user picked, and those new to the hub', () => {
    const page = browse(
      catalog,
      { ...all, q: 'sistemi' },
      new Set(['pc-1']),
      now,
    );
    expect(page.courses).toEqual([
      {
        externalId: '1',
        name: 'Operativni sistemi',
        url: 'https://courses.example.edu/1',
        picked: true,
        isNew: true,
      },
    ]);
    const old = browse(catalog, { ...all, q: 'mreze' }, new Set(), now);
    expect(old.courses[0]).toMatchObject({ picked: false, isNew: false });
  });

  it('pages what matches, counting all of it', () => {
    const page = browse(
      catalog,
      { q: 'računara', offset: 1, limit: 1 },
      new Set(),
      now,
    );
    expect(page).toMatchObject({
      total: 2,
      courses: [{ name: 'Arhitektura računara 10' }],
    });
    expect(browse(catalog, { ...all, q: 'nothing' }, new Set(), now)).toEqual({
      total: 0,
      courses: [],
    });
  });
});
