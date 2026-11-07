import type { ContentHash } from '@app/kernel';

// How many contents a pick and a course of the user's own share at least
// for the one to be suggested for the other: one alone is too often a
// syllabus template or a school-wide notice
export const MIN_SHARED = 2;

// a content the user sees, in a portal course (ListVisibleContentQuery)
export interface Content {
  portalCourseId: string;
  hash: ContentHash;
}

// The course of the user's own each pick may be shown with (README,
// Matching): of the courses holding the portal courses of their own
// accounts (`own`, each by the course's slug), the one sharing the most
// contents with the pick, at least MIN_SHARED, each content counted once;
// of two alike, the first by slug. Only `contents` count, so only what the
// user sees: what they don't read can't tip it either way.
export function suggestions(
  contents: readonly Content[],
  picks: readonly string[],
  own: ReadonlyMap<string, string>,
): Map<string, string> {
  const picked = new Set(picks);
  const ofPick = new Map<string, Set<ContentHash>>();
  const ofCourse = new Map<string, Set<ContentHash>>();
  for (const { portalCourseId, hash } of contents) {
    const [of, key] = picked.has(portalCourseId)
      ? [ofPick, portalCourseId]
      : [ofCourse, own.get(portalCourseId)];
    if (key !== undefined) of.set(key, (of.get(key) ?? new Set()).add(hash));
  }
  const courses = [...ofCourse].sort(([a], [b]) => (a < b ? -1 : 1));
  return new Map(
    [...ofPick].flatMap(([pick, hashes]) => {
      const best = courses
        .map(([slug, theirs]) => ({
          slug,
          shared: [...hashes].filter((hash) => theirs.has(hash)).length,
        }))
        .reduce((a, b) => (b.shared > a.shared ? b : a), {
          slug: '',
          shared: MIN_SHARED - 1,
        });
      return best.slug ? [[pick, best.slug] as const] : [];
    }),
  );
}
