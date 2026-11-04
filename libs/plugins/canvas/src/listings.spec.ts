import { settle, SyncState } from './listings.js';

describe('listings', () => {
  it('start empty, and over a state that is not theirs', () => {
    expect(SyncState.parse(null)).toEqual({ courses: {} });
    expect(SyncState.parse({ cursor: 'x' })).toEqual({ courses: {} });
  });

  it('find gone what a source that went through no longer has', () => {
    const last = {
      items: { assignments: ['assignment:1', 'assignment:2'] },
      files: { files: ['10', '11'] },
    };
    const now = {
      items: { assignments: ['assignment:2', 'assignment:3'] },
      files: { files: ['10'] },
    };
    expect(settle(last, now)).toEqual({
      listings: now,
      gone: { items: ['assignment:1'], files: ['11'] },
    });
  });

  it('keep what a source had while it is refused, failed or skipped', () => {
    const last = {
      items: { pages: ['page:1', 'page:2'], assignments: ['assignment:1'] },
      files: { files: ['10'] },
    };
    const now = { items: { assignments: ['assignment:1'] }, files: {} };
    expect(settle(last, now)).toEqual({
      listings: last,
      gone: { items: [], files: [] },
    });
  });

  it('find nothing gone that another source still has', () => {
    // the pages tab hidden since: the page is still in a module
    const last = {
      items: { pages: ['page:1'], 'module-pages': ['page:1'] },
      files: {},
    };
    const now = { items: { pages: [], 'module-pages': ['page:1'] }, files: {} };
    expect(settle(last, now).gone.items).toEqual([]);
    expect(
      settle(last, { items: { pages: [], 'module-pages': [] }, files: {} }).gone
        .items,
    ).toEqual(['page:1']);
  });

  it('find nothing gone on a course seen for the first time', () => {
    expect(
      settle(undefined, { items: { modules: ['module:1'] }, files: {} }).gone,
    ).toEqual({ items: [], files: [] });
  });
});
