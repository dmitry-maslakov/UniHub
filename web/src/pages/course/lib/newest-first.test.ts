import { describe, expect, it } from 'vitest';
import { newestFirst } from './newest-first';

const file = (name: string, path: string, changedAt: string | null) => ({
  name,
  path,
  changedAt,
});

describe('newestFirst', () => {
  const input = [
    file('l10.pdf', 'Predavanja', null),
    file('old.pdf', 'Vežbe', '2026-09-01T12:00:00.000Z'),
    file('top.pdf', '', null),
    file('l2.pdf', 'Predavanja', null),
    file('b.pdf', 'Vežbe', '2026-11-05T12:00:00.000Z'),
    file('a.pdf', 'Predavanja', '2026-11-05T12:00:00.000Z'),
  ];

  it('puts the newest first and the undated last, each by folder then name', () => {
    expect(newestFirst(input).map((f) => f.name)).toEqual([
      'a.pdf',
      'b.pdf',
      'old.pdf',
      'top.pdf',
      'l2.pdf',
      'l10.pdf',
    ]);
  });

  it('leaves the list it was given as it was', () => {
    const names = input.map((f) => f.name);
    newestFirst(input);
    expect(input.map((f) => f.name)).toEqual(names);
  });
});
