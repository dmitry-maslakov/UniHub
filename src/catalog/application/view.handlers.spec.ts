import { ContentHash, PortalId } from '@app/kernel';
import { UnknownReferenceError } from '../domain/errors.js';
import type { Shown } from '../domain/publication.js';
import {
  ForgetAccountCommand,
  StoreBytesCommand,
  ViewCourseCommand,
  ViewCoursesCommand,
  type FileInput,
  type ItemInput,
  type Seen,
} from './commands.js';
import type { VersionData } from '../domain/view/view.repository.js';
import { onFakes } from './handlers.fakes.js';

const portal = PortalId.parse('lms');
const at = (minute: number): Shown => ({
  shownFrom: new Date(Date.UTC(2026, 10, 6, 12, minute)),
  openFrom: new Date(Date.UTC(2026, 10, 6, 12, minute + 15)),
});
const course = (externalId: string) => ({
  portal,
  externalId,
  name: `Course ${externalId}`,
  url: null,
  meta: null,
});
const post = (externalId: string, title = externalId): ItemInput => ({
  portal,
  externalId,
  course: 'c1',
  kind: 'announcement',
  title,
  url: null,
  publishedAt: null,
  raw: { title },
});
const file = (externalId: string, size = 10): FileInput => ({
  portal,
  externalId,
  course: 'c1',
  item: null,
  name: `${externalId}.pdf`,
  path: '',
  url: null,
  size,
  mime: null,
  sourceUpdatedAt: new Date('2026-11-01T00:00:00Z'),
});
const open = <T>(record: T, isOpen = true): Seen<T> => ({
  record,
  open: isOpen,
});
const nothingGone: { items: string[]; files: string[] } = {
  items: [],
  files: [],
};
const hash = ContentHash.parse('a'.repeat(64));

async function viewing() {
  const fakes = await onFakes();
  const { commands, views } = fakes;
  const courses = (account: string, ids: string[], minute = 0) =>
    commands.execute(
      new ViewCoursesCommand(account, portal, ids.map(course), at(minute)),
    );
  const pass = (
    account: string,
    items: Seen<ItemInput>[],
    files: Seen<FileInput>[] = [],
    { minute = 0, gone = nothingGone, of = 'c1' } = {},
  ) =>
    commands.execute(
      new ViewCourseCommand(
        account,
        portal,
        of,
        items,
        files,
        gone,
        at(minute),
      ),
    );
  // the account's sights as they stand, by its versions' titles or names
  const sees = (account: string) =>
    Object.fromEntries(
      [...views.of(account)].map(([id, sight]) => {
        const data = views.version(id).data as { title?: string; name: string };
        return [data.title ?? data.name, sight];
      }),
    );
  return { ...fakes, courses, pass, sees };
}

describe('views of users’ accounts', () => {
  it('keeps one version of a record for the accounts that see it alike, another for one that sees it otherwise', async () => {
    const { courses, pass, views } = await viewing();
    for (const account of ['ana', 'bo', 'cy']) await courses(account, ['c1']);
    await pass('ana', [open(post('news'))]);
    await pass('bo', [open(post('news'))]);
    await pass('cy', [open(post('news', 'news, edited'))]);

    const posts = views.made.filter((v) => v.kind === 'item');
    expect(posts).toHaveLength(2);
    expect(new Set(posts.map((v) => v.recordId)).size).toBe(1);
    expect([...views.of('ana').keys()]).toEqual([...views.of('bo').keys()]);
  });

  it("refuses a pass of a course the account's courses didn't name", async () => {
    const { courses, pass } = await viewing();
    await courses('ana', ['c1']);
    await courses('bo', ['c2']);

    await expect(pass('bo', [open(post('news'))])).rejects.toBeInstanceOf(
      UnknownReferenceError,
    );
    await expect(pass('ana', [], [], { of: 'c-never' })).rejects.toBeInstanceOf(
      UnknownReferenceError,
    );
  });

  it('shows what a pass sent from its publication, and hides of what the next leaves out only what it says is gone', async () => {
    const { courses, pass, sees } = await viewing();
    await courses('ana', ['c1']);
    await pass(
      'ana',
      [open(post('news')), open(post('exam'))],
      [open(file('slides'))],
    );
    expect(sees('ana').news).toEqual({
      open: true,
      ...at(0),
      hiddenFrom: null,
    });

    // gone from a listing that went through; whatever a failed one had stays
    await pass('ana', [open(post('news'))], [], {
      minute: 60,
      gone: { items: [], files: ['slides'] },
    });
    expect(sees('ana')).toMatchObject({
      news: { shownFrom: at(0).shownFrom, hiddenFrom: null },
      exam: { hiddenFrom: null },
      'slides.pdf': { hiddenFrom: at(60).shownFrom },
    });
  });

  it('hides a version once another of its record comes, gone or not', async () => {
    const { courses, pass, sees } = await viewing();
    await courses('ana', ['c1']);
    await pass('ana', [open(post('news'))]);
    await pass('ana', [open(post('news', 'news, edited'))], [], {
      minute: 60,
    });

    expect(sees('ana')).toMatchObject({
      news: { hiddenFrom: at(60).shownFrom },
      'news, edited': { shownFrom: at(60).shownFrom, hiddenFrom: null },
    });
  });

  it('locks a version for the account, and opens it a hold after the pass that unlocks it', async () => {
    const { courses, pass, sees } = await viewing();
    await courses('ana', ['c1']);
    await pass('ana', [], [open(file('slides'), false)]);
    expect(sees('ana')['slides.pdf']).toMatchObject({ open: false });

    await pass('ana', [], [open(file('slides'))], { minute: 60 });
    expect(sees('ana')['slides.pdf']).toEqual({
      open: true,
      shownFrom: at(0).shownFrom,
      openFrom: at(60).openFrom,
      hiddenFrom: null,
    });
  });

  it("hides what the account saw in a course it's no longer in, with the course", async () => {
    const { courses, pass, sees } = await viewing();
    await courses('ana', ['c1', 'c2']);
    await pass('ana', [open(post('news'))], [open(file('slides'))]);
    await courses('ana', ['c2'], 60);

    const hidden = { hiddenFrom: at(60).shownFrom };
    expect(sees('ana')).toMatchObject({
      'Course c1': hidden,
      'Course c2': { hiddenFrom: null },
      news: hidden,
      'slides.pdf': hidden,
    });
  });

  it("gives a file's bytes to every version of it at the size and date they came at, and to no other", async () => {
    const { courses, pass, views, commands } = await viewing();
    for (const account of ['ana', 'bo', 'cy']) await courses(account, ['c1']);
    await pass('ana', [], [open(file('slides'))]);
    // renamed for bo: the same bytes
    await pass('bo', [], [open({ ...file('slides'), name: 'renamed.pdf' })]);
    await pass('cy', [], [open(file('slides', 20))]);

    const stamp = { size: 10, sourceUpdatedAt: file('slides').sourceUpdatedAt };
    const slides = { portal, externalId: 'slides' };
    expect(
      await commands.execute(new StoreBytesCommand(slides, stamp, hash)),
    ).toEqual({ changed: true });
    const hashes = views.made
      .filter((v) => v.kind === 'file')
      .map((v) => {
        const { name, size } = v.data as VersionData['file'];
        return [name, size, v.hash];
      });
    expect(hashes).toEqual([
      ['slides.pdf', 10, hash],
      ['renamed.pdf', 10, hash],
      ['slides.pdf', 20, null],
    ]);
    expect(
      await commands.execute(new StoreBytesCommand(slides, stamp, hash)),
    ).toEqual({ changed: false });

    await expect(
      commands.execute(
        new StoreBytesCommand({ portal, externalId: 'nope' }, file('x'), hash),
      ),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
  });

  it('forgets an account, everything it saw', async () => {
    const { courses, pass, views, commands } = await viewing();
    await courses('ana', ['c1']);
    await pass('ana', [open(post('news'))]);
    await commands.execute(new ForgetAccountCommand('ana'));

    expect(views.sights.has('ana')).toBe(false);
  });
});
