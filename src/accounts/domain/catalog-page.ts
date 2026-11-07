const DAY = 24 * 60 * 60 * 1000;

// How long a course is new once the hub first saw it in its portal's
// catalog
export const NEW_DAYS = 14;

// a course of a public portal's catalog, as its one account sees it, and
// since when the hub has it
export interface CatalogCourse {
  id: string;
  externalId: string;
  name: string;
  url: string | null;
  since: Date;
}

// a course as a user browses the catalog: picked by them, new to the hub
export interface CatalogEntry {
  externalId: string;
  name: string;
  url: string | null;
  picked: boolean;
  isNew: boolean;
}

export interface CatalogPage {
  total: number;
  courses: CatalogEntry[];
}

export interface Browse {
  q?: string;
  offset: number;
  limit: number;
}

// The same letters whatever their case or diacritics (č as c, đ as d, Ж as
// ж): Intl's collator at its base strength, as a search of the page would
// match them. Names in the order people read them, numbers by value.
const sameLetters = new Intl.Collator('und', {
  usage: 'search',
  sensitivity: 'base',
});
const byName = new Intl.Collator('und', { numeric: true });

// Whether `q` is in the name, as the collator reads letters: each stretch
// of the name as long as q, compared with it whole
export function nameHas(name: string, q: string) {
  const text = name.normalize('NFC');
  const words = q.normalize('NFC');
  for (let at = 0; at + words.length <= text.length; at++)
    if (sameLetters.compare(text.slice(at, at + words.length), words) === 0)
      return true;
  return false;
}

// A page of the catalog as a user browses it: the courses whose name has q
// (every one without it), by name, each marked picked (one of `picks`) and
// new (first seen within NEW_DAYS), and how many there are in all
export function browse(
  courses: readonly CatalogCourse[],
  { q, offset, limit }: Browse,
  picks: ReadonlySet<string>,
  now: Date,
): CatalogPage {
  const found = courses
    .filter((course) => !q || nameHas(course.name, q))
    .sort(
      (a, b) =>
        byName.compare(a.name, b.name) ||
        byName.compare(a.externalId, b.externalId),
    );
  const fresh = now.getTime() - NEW_DAYS * DAY;
  return {
    total: found.length,
    courses: found
      .slice(offset, offset + limit)
      .map(({ id, externalId, name, url, since }) => ({
        externalId,
        name,
        url,
        picked: picks.has(id),
        isNew: since.getTime() > fresh,
      })),
  };
}
