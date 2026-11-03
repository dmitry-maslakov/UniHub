import { isDeepStrictEqual } from 'node:util';

export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

export interface Upserted<T> {
  entity: T;
  // what was there before, null for a new record
  previous: T | null;
  // false when the portal sent exactly what we already had
  changed: boolean;
}

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
