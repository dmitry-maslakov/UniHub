import { describe, expect, it } from 'vitest';
import { initialsOf, scopeOf } from './course-initials';

const asp = { slug: 'asp', name: 'Algoritmi i strukture podataka' };
const ar = { slug: 'ar', name: 'Arhitektura računara' };
const oop = { slug: 'oop', name: 'Objektno orijentisano programiranje 1' };
const courses = [asp, ar, oop];

describe('initialsOf', () => {
  it.each([
    ['Algoritmi i strukture podataka', 'ASP'],
    ['Arhitektura računara', 'AR'],
    ['Objektno orijentisano programiranje 1', 'OOP'],
    ['Theory of Computation', 'TC'],
    ['Šume i ćilimi', 'ŠĆ'],
  ])('takes %s as %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });

  it('gives none for fewer than 2 letters', () => {
    expect(initialsOf('Matematika')).toBeNull();
    expect(initialsOf('Matematika 2')).toBeNull();
    expect(initialsOf('')).toBeNull();
  });
});

describe('scopeOf', () => {
  it('answers the course a word names, and the query without it', () => {
    expect(scopeOf('stek asp', courses)).toEqual({ course: asp, q: 'stek' });
    expect(scopeOf('  AR   cache memory ', courses)).toEqual({
      course: ar,
      q: 'cache memory',
    });
  });

  it('leaves a word alone to match file names', () => {
    expect(scopeOf('ASP', courses)).toBeNull();
  });

  it('names no course for a query that has none of the initials', () => {
    expect(scopeOf('stek heap', courses)).toBeNull();
  });

  it('scopes nothing by initials two courses share', () => {
    const shared = [asp, { slug: 'asp2', name: 'Anatomija stopala pasa' }];
    expect(scopeOf('stek asp', shared)).toBeNull();
  });

  it('scopes nothing when two words are initials', () => {
    expect(scopeOf('asp ar', courses)).toBeNull();
  });

  it('leaves a query under the 2 characters a search needs', () => {
    expect(scopeOf('asp a', courses)).toBeNull();
  });
});
