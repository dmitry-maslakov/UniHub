import { Readable } from 'node:stream';
import { Instance, NO_INSTANCE, PortalId } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import * as catalog from '../../catalog/contracts.js';
import { Connection } from '../domain/connection.js';
import { MalformedRecordError } from '../domain/errors.js';
import type { Run } from './course-pass.js';
import { ingest } from './ingest.fakes.js';

const portal = PortalId.parse('lms');
const shared = Connection.shared(portal);
const ana = Connection.of({ portal, account: 'ana' });
const at = {
  shownFrom: new Date('2026-11-06T12:10:00Z'),
  openFrom: new Date('2026-11-06T12:25:00Z'),
};
const run: Run = { shown: () => at, leaseMs: 90 * 60_000 };
const post = (externalId: string) => ({ externalId, kind: 'post', raw: {} });
const updatedAt = '2026-11-01T10:00:00Z';
const file = (externalId: string, more = {}) => ({
  externalId,
  name: `${externalId}.pdf`,
  size: 10,
  updatedAt,
  ...more,
});
const stamp = { size: 10, sourceUpdatedAt: new Date(updatedAt) };
const ref = (externalId: string) => ({
  portal,
  instance: NO_INSTANCE,
  externalId,
});
const of = <T extends object>(
  sent: object[],
  kind: abstract new (...args: never[]) => T,
) => sent.filter((m): m is T => m instanceof kind);

describe('a pass of the shared account', () => {
  it('sends its records one by one as they come, and removes at the end what is gone, unless it sent it after all', async () => {
    const { service, sent } = ingest();
    const pass = service.pass(shared, 'c1');
    await pass.item(post('p1'), undefined);
    expect(of(sent, catalog.UpsertItemCommand)[0].data).toMatchObject({
      externalId: 'p1',
      course: 'c1',
    });
    await pass.file(file('f1'), undefined);
    await pass.end({ items: ['p3', 'p1'], files: ['f2'] });

    expect(sent.slice(2)).toEqual([
      new catalog.RemoveItemCommand(ref('p3')),
      new catalog.RemoveFileCommand(ref('f2')),
    ]);
  });

  it('fetches what catalog has no content for, unless it is locked or too large', async () => {
    const { service } = ingest();
    const pass = service.pass(shared, 'c1');
    expect(await pass.file(file('f1'), undefined)).toEqual({ fetch: true });
    expect(await pass.file(file('f2'), { locked: true })).toEqual({
      fetch: false,
    });
    expect(await pass.file(file('f3', { size: 101 }), undefined)).toEqual({
      fetch: false,
    });
  });

  it("stores a file's content after the end, as catalog's", async () => {
    const { service, sent } = ingest();
    const pass = service.pass(shared, 'c1');
    await pass.file(file('f1'), undefined);
    await pass.end(undefined);
    const { hash } = await pass.content('f1', Readable.from(['%PDF']));

    expect(hash).toBe(sha256('%PDF'));
    expect(sent.at(-1)).toEqual(
      new catalog.SetFileContentCommand(ref('f1'), hash),
    );
  });
});

describe("a pass of a user's own account", () => {
  it('sends nothing till the end, then the whole view of the course, shown when the run says', async () => {
    const { service, sent, outbox } = ingest();
    const pass = service.pass(ana, 'c1', run);
    await pass.item(post('p1'), undefined);
    await pass.item(post('p2'), { locked: true });
    await pass.file(file('f1', { item: 'p1' }), { locked: true });
    expect(sent).toEqual([]);

    await pass.end({ files: ['f9'], items: 'nonsense' });
    const [view] = of(sent, catalog.ViewCourseCommand);
    expect(view).toMatchObject({
      account: 'ana',
      site: { portal, instance: NO_INSTANCE },
      course: 'c1',
      gone: { items: [], files: ['f9'] },
      at,
    });
    expect(view.items.map((i) => [i.record.externalId, i.open])).toEqual([
      ['p1', true],
      ['p2', false],
    ]);
    expect(view.files).toMatchObject([
      { record: { externalId: 'f1', item: 'p1', course: 'c1' }, open: false },
    ]);
    expect(outbox.notify).toHaveBeenCalled();
  });

  it('fetches the bytes of a version once: the first open view that takes its lease, unless the hub has them', async () => {
    const { service, leases } = ingest({ had: ['f2'] });
    const first = service.pass(ana, 'c1', run);
    const bo = Connection.of({ portal, account: 'bo' });
    const second = service.pass(bo, 'c1', run);

    expect(await first.file(file('f1'), { locked: true })).toEqual({
      fetch: false,
    });
    expect(await second.file(file('f1'), undefined)).toEqual({ fetch: true });
    expect(await first.file(file('f1'), undefined)).toEqual({ fetch: false });
    // another version of its bytes is another lease
    expect(await first.file(file('f1', { size: 11 }), undefined)).toEqual({
      fetch: true,
    });
    expect(await first.file(file('f2'), undefined)).toEqual({ fetch: false });
    expect(await first.file(file('f3', { size: 101 }), undefined)).toEqual({
      fetch: false,
    });
    // nor a lease for one it couldn't store; each for as long as a run
    // may take
    expect(
      [...leases.taken.keys()].filter((key) => key.includes('f3')),
    ).toEqual([]);
    expect(new Set(leases.taken.values())).toEqual(new Set([run.leaseMs]));
  });

  it('stores bytes for the version the pass saw, once it has ended, of a file open to the account', async () => {
    const { service, sent, blobs } = ingest();
    const pass = service.pass(ana, 'c1', run);
    await pass.file(file('f1'), undefined);
    await pass.file(file('f2'), { locked: true });

    const early = Readable.from(['%PDF']);
    await expect(pass.content('f1', early)).rejects.toThrow(
      MalformedRecordError,
    );
    expect(early.destroyed).toBe(true);
    await pass.end(undefined);
    await expect(pass.item(post('p1'), undefined)).rejects.toThrow(
      MalformedRecordError,
    );
    for (const [id, error] of [
      ['f2', MalformedRecordError],
      ['f9', catalog.UnknownReferenceError],
    ] as const)
      await expect(pass.content(id, Readable.from(['x']))).rejects.toThrow(
        error,
      );
    expect(blobs.stored.size).toBe(0);

    const { hash } = await pass.content('f1', Readable.from(['%PDF']));
    expect(sent.at(-1)).toEqual(
      new catalog.StoreBytesCommand(ref('f1'), stamp, hash),
    );
  });

  it("refuses a record of another course, and a file's post the pass didn't send before it", async () => {
    const { service } = ingest();
    const pass = service.pass(ana, 'c1', run);
    await expect(
      pass.item({ ...post('p1'), course: 'c2' }, undefined),
    ).rejects.toThrow(MalformedRecordError);
    await expect(
      pass.file(file('f1', { item: 'p9' }), undefined),
    ).rejects.toThrow(catalog.UnknownReferenceError);
  });
});

describe("an account's courses", () => {
  it("are the shared account's to add to, one by one, and a user's account's view of them as a whole, a refused one left out", async () => {
    const { service, sent } = ingest();
    const course = { externalId: 'c1', name: 'OS' };
    const nameless = { externalId: 'c2' };
    expect(await service.courses(shared, [course, nameless])).toEqual({
      refused: [
        { externalId: 'c2', issues: [expect.stringMatching(/^name: /)] },
      ],
    });
    // an account of a site, whatever site the connector says
    const site = Instance.parse('https://canvas.example.edu');
    const bo = Connection.of({ portal, account: 'bo' }).at(site);
    await service.courses(
      bo,
      [nameless, { ...course, instance: 'https://elsewhere.example.edu' }],
      run,
    );

    const input = (instance: Instance) => ({
      portal,
      instance,
      externalId: 'c1',
      name: 'OS',
      url: null,
      meta: null,
    });
    expect(sent).toEqual([
      new catalog.UpsertPortalCourseCommand(input(NO_INSTANCE)),
      new catalog.ViewCoursesCommand(
        'bo',
        { portal, instance: site },
        [input(site)],
        ['c2'],
        at,
      ),
    ]);
    await expect(service.courses(ana, course, run)).rejects.toThrow(
      MalformedRecordError,
    );
  });
});
