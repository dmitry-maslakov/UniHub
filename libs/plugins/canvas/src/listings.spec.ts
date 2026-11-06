import { settle, SyncState } from './listings.js';

describe('listings', () => {
  it('start empty, and over a state that is not theirs', () => {
    expect(SyncState.parse(null)).toEqual({ courses: {} });
    expect(SyncState.parse({ cursor: 'x' })).toEqual({ courses: {} });
  });

  it('start each run from its own empty state', () => {
    const first = SyncState.parse(null);
    first.courses['101'] = { items: {}, files: {} };
    expect(SyncState.parse(null)).toEqual({ courses: {} });
  });

  it('keep no more of what a source that went through had than it has now', () => {
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
      kept: { items: ['assignment:2', 'assignment:3'], files: ['10'] },
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
      kept: { items: ['page:1', 'page:2', 'assignment:1'], files: ['10'] },
    });
  });

  it('keep what another source still has', () => {
    // the pages tab hidden since: the page is still in a module
    const last = {
      items: { pages: ['page:1'], 'module-pages': ['page:1'] },
      files: {},
    };
    const now = { items: { pages: [], 'module-pages': ['page:1'] }, files: {} };
    expect(settle(last, now).kept.items).toEqual(['page:1']);
    expect(
      settle(last, { items: { pages: [], 'module-pages': [] }, files: {} }).kept
        .items,
    ).toEqual([]);
  });

  it('keep what a course seen for the first time has', () => {
    expect(
      settle(undefined, { items: { modules: ['module:1'] }, files: {} }).kept,
    ).toEqual({ items: ['module:1'], files: [] });
  });
});
