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
    ['Objektno-orijentisano programiranje', 'OOP'],
    ['Algoritmi i strukture podataka (ASP)', 'ASP'],
    ['Matematička analiza II', 'MA'],
    ['Matematička analiza I', 'MA'],
    ['Analiza II', null],
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

  it('leaves the connecting words and lowercase pairs of letters to be searched', () => {
    const numerical = { slug: 'na', name: 'Numerička analiza' };
    const discrete = { slug: 'it', name: 'Information Theory' };
    expect(scopeOf('zadaci na ispitu', [numerical])).toBeNull();
    expect(scopeOf('what it does', [discrete])).toBeNull();
    expect(scopeOf('stek ar', courses)).toBeNull();
    expect(scopeOf('stek NA', [numerical])).toEqual({
      course: numerical,
      q: 'stek',
    });
  });

  it('names a course by initials with or without diacritics, and 3 or more letters in any case', () => {
    const sume = { slug: 'sc', name: 'Šume i ćilimi' };
    expect(scopeOf('stek SC', [sume])).toEqual({ course: sume, q: 'stek' });
    expect(scopeOf('stek Asp', courses)).toEqual({ course: asp, q: 'stek' });
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
    expect(scopeOf('asp AR', courses)).toBeNull();
  });

  it('leaves a query under the 2 characters a search needs', () => {
    expect(scopeOf('asp a', courses)).toBeNull();
  });
});
