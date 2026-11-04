import { isDeepStrictEqual } from 'node:util';

// Portals resend the same data on every sync, only real changes should go
// further down the pipeline. Missing optional fields count as null, and
// key order in json doesn't matter (postgres reorders jsonb keys anyway).
export function differs<T extends object>(
  current: T,
  next: Partial<T>,
): boolean {
  return Object.entries(next).some(
    ([key, value]) =>
      !isDeepStrictEqual(current[key as keyof T] ?? null, value ?? null),
  );
}

// A lone UTF-16 surrogate is no Unicode text: written as UTF-8 it comes back
// as U+FFFD
const LONE_SURROGATE = /\p{Cs}/gu;

// A value as it is once stored and read back. The strict compare above sees
// '\uD800' and -0 as other than the '\uFFFD' and 0 that postgres (and JSON)
// keep, so records holding them counted as changed on every sync; they are
// taken in this form instead, before they are compared or written.
export function kept<T>(value: T): T {
  if (typeof value === 'string')
    return value.replace(LONE_SURROGATE, '\uFFFD') as T;
  // -0 === 0, so this turns -0 into 0
  if (typeof value === 'number') return (value === 0 ? 0 : value) as T;
  if (Array.isArray(value)) return value.map(kept) as T;
  if (value !== null && typeof value === 'object' && !(value instanceof Date))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [kept(k), kept(v)]),
    ) as T;
  return value;
}
