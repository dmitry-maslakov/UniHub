import { fingerprintOf, viewChange, type Sighting } from './view.js';

const sight = (recordId: string, versionId: string, open = true): Sighting => ({
  recordId,
  versionId,
  open,
});

describe('fingerprintOf', () => {
  it('is the same for the same record, whatever order its keys came in', () => {
    const a = fingerprintOf({ title: 'Exam', raw: { a: 1, b: [2] } });
    expect(fingerprintOf({ raw: { b: [2], a: 1 }, title: 'Exam' })).toBe(a);
    expect(
      fingerprintOf({ title: 'Exam moved', raw: { a: 1, b: [2] } }),
    ).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('viewChange', () => {
  const before = [
    sight('news', 'news-1'),
    sight('exam', 'exam-1'),
    sight('old', 'old-1'),
  ];

  it('shows what the pass sent anew, hides another version of a record and what is gone', () => {
    expect(
      viewChange(before, [
        sight('news', 'news-1'),
        sight('exam', 'exam-2'),
        sight('new', 'new-1'),
      ]),
    ).toEqual({
      show: [sight('exam', 'exam-2'), sight('new', 'new-1')],
      reopen: [],
      hide: [sight('exam', 'exam-1'), sight('old', 'old-1')],
    });
  });

  it('keeps what a failed listing had, unless the pass sent it as another version', () => {
    const { hide } = viewChange(
      before,
      [sight('exam', 'exam-2')],
      new Set(['old', 'exam']),
    );
    expect(hide).toEqual([sight('news', 'news-1'), sight('exam', 'exam-1')]);
  });

  it('opens or locks a version it sees still, as the pass saw it', () => {
    expect(
      viewChange(
        before,
        [sight('news', 'news-1', false)],
        new Set(['exam', 'old']),
      ),
    ).toEqual({
      show: [],
      reopen: [sight('news', 'news-1', false)],
      hide: [],
    });
  });
});
