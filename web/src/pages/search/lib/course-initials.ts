// A course's initials, which a query can name it by ("ASP" for "Algoritmi i
// strukture podataka"), and the course a query names that way.

// words that join a name's others give no initial
const CONNECTING = new Set([
  'i',
  'u',
  'o',
  'a',
  'na',
  'za',
  'sa',
  'od',
  'do',
  'and',
  'of',
  'the',
  'in',
  'for',
]);

// a letter without its diacritics, to compare initials by
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '');

// a number, Arabic or Roman, or a word in brackets (an acronym the name
// already gives), gives no initial
const isNumber = (word: string) =>
  /^\p{N}+$/u.test(word) || /^[IVX]+$/.test(word);
const isBracketed = (word: string) => /^[([].*[)\]]$/.test(word);

// the first letters of a name's words (split at spaces and hyphens),
// upper-cased; none for fewer than 2
export function initialsOf(name: string) {
  const letters = name
    .split(/[\s-]+/)
    .filter((word) => !CONNECTING.has(word.toLowerCase()))
    .flatMap((word) =>
      isNumber(word) || isBracketed(word) ? [] : (word.match(/\p{L}/u) ?? []),
    )
    .join('')
    .toUpperCase();
  return letters.length >= 2 ? letters : null;
}

// Whether a word in a query is these initials, diacritics aside. Of 2 letters
// it must be typed in capitals ("AR", not "ar"), as short words are common;
// connecting words (lowercase) never are.
const names = (word: string, initials: string | null) => {
  if (!initials || CONNECTING.has(word)) return false;
  const key = fold(word);
  return (key.length === 2 ? key : key.toUpperCase()) === fold(initials);
};

// The one course a query names by its initials: it has at least two words,
// exactly one of them is some course's initials, and only that course's.
// The course comes with the query less that word. A word alone is left to
// match file names, and initials two courses share name none; nor is a
// query left under the 2 characters a search needs.
export function scopeOf<C extends { name: string }>(
  query: string,
  courses: readonly C[],
): { course: C; q: string } | null {
  const words = query.trim().split(/\s+/);
  if (words.length < 2) return null;
  const named = words.flatMap((word, at) => {
    const matching = courses.filter(({ name }) =>
      names(word, initialsOf(name)),
    );
    return matching.length ? [{ at, matching }] : [];
  });
  if (named.length !== 1 || named[0].matching.length !== 1) return null;
  const [{ at, matching }] = named;
  const q = words.filter((_, i) => i !== at).join(' ');
  return q.length >= 2 ? { course: matching[0], q } : null;
}
