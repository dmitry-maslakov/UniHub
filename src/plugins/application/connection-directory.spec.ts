import { Instance, PortalId, Secret } from '@app/plugin-sdk';
import {
  catalogOf,
  directoryOf,
  pluginSettings,
  poll,
} from '../../../test/discovered-plugins.js';
import { Connection, type IngestService } from '../../ingest/contracts.js';
import type { InstanceAdoption } from './instance-adoption.js';

const lms = PortalId.parse('lms');
const credential = { kind: 'token' as const, token: new Secret('ana~1') };
const SCHOOL = Instance.parse('https://lms.example.edu');
const OWN = Instance.parse('https://lms.example.org');

// lms a site per school, its settings naming SCHOOL; moodle one site
const sitesCatalog = () =>
  catalogOf({
    polls: [
      poll(
        'lms',
        {
          poll: async () => {},
          identify: async () => ({ id: '1', expiresAt: null }),
          configuredInstance: () => SCHOOL,
        } as never,
        ['token'],
        true,
      ),
      poll('moodle'),
    ],
  });

describe('ConnectionDirectory', () => {
  it("runs a portal read as shared for the shared account, any other for its users' own accounts alone", async () => {
    const directory = directoryOf({ lms: ['ana', 'bo'] });
    const keys = async (portal: string) =>
      (await directory.connections(PortalId.parse(portal))).map((c) => c.key);

    expect(await keys('moodle')).toEqual(['moodle__shared']);
    expect(await keys('lms')).toEqual(['lms__ana', 'lms__bo']);
  });

  it("gives a user's account's run its credential, and shows what it finds at the slot it started in", async () => {
    const courses = vi.fn(async () => ({ refused: [] }));
    const directory = directoryOf({ lms: ['ana'] }, { ana: credential }, {
      courses,
    } as unknown as IngestService);
    const ana = Connection.of({ portal: lms, account: 'ana' });
    const { everyMs, offsetMs } = directory.gridOf(ana);
    const slot = Date.UTC(2026, 10, 6) + offsetMs;

    const found = await directory.context(
      ana,
      new AbortController().signal,
      new Date(slot + everyMs / 2),
    );
    const ctx = found!.context;
    await ctx.ingest.courses([]);

    const [[, , run]] = courses.mock.calls as unknown as [
      [unknown, unknown, { shown: (ended: Date) => object; leaseMs: number }],
    ];
    // PUBLISH_DELAY_MINUTES and HOLD_MINUTES as they are by default
    expect(run.shown(new Date(slot + 60_000))).toEqual({
      shownFrom: new Date(slot + 10 * 60_000),
      openFrom: new Date(slot + 25 * 60_000),
    });
    // a file's lease, as long as the run may take
    expect(run.leaseMs).toBe(pluginSettings().pollTimeoutMs);
    expect(ctx.account.kind).toBe('user');
    // which seal of its credential, to say which one the portal refused
    expect(found!.seal).toBe('seal-of-ana');
  });

  it("reads the shared account's records at the site the portal's settings name, a user's at their account's", async () => {
    const courses = vi.fn(async () => ({ refused: [] }));
    const directory = directoryOf(
      { lms: ['ana'] },
      { ana: { ...credential, url: OWN } },
      { courses } as unknown as IngestService,
      sitesCatalog(),
    );
    const signal = new AbortController().signal;
    for (const connection of [
      Connection.shared(lms),
      Connection.of({ portal: lms, account: 'ana' }),
    ])
      await (await directory.context(
        connection,
        signal,
      ))!.context.ingest.courses([]);

    const sites = (courses.mock.calls as unknown as [Connection][]).map(
      ([connection]) => [connection.account, connection.instance],
    );
    expect(sites).toEqual([
      ['shared', SCHOOL],
      ['ana', OWN],
    ]);
  });

  it("gives no run to an account that no longer reads, and the shared account's its own", async () => {
    const directory = directoryOf({ lms: ['bo'] });
    const signal = new AbortController().signal;
    expect(
      await directory.context(
        Connection.of({ portal: lms, account: 'bo' }),
        signal,
      ),
    ).toBeNull();
    expect(await directory.context(Connection.shared(lms), signal)).toEqual({
      context: expect.objectContaining({ account: { kind: 'shared' } }),
      seal: null,
    });
  });

  it("gives a run of a portal of sites its context once the rows from before are its site's, and holds up no other portal's", async () => {
    // each ask of the adoption waits until the spec settles it
    let settle: { resolve: () => void; reject: (error: Error) => void };
    const done = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject };
        }),
    );
    const directory = directoryOf({}, {}, {} as IngestService, sitesCatalog(), {
      done,
    } as unknown as InstanceAdoption);
    const signal = new AbortController().signal;
    const shared = (portal: string) =>
      directory.context(Connection.shared(PortalId.parse(portal)), signal);

    expect(await shared('moodle')).not.toBeNull();
    expect(done).not.toHaveBeenCalled();

    let given = false;
    const waiting = shared('lms').then((found) => {
      given = true;
      return found;
    });
    await new Promise(setImmediate);
    expect(given).toBe(false);
    settle!.resolve();
    expect(await waiting).toMatchObject({ seal: null });

    const failing = shared('lms');
    settle!.reject(new Error('database away'));
    await expect(failing).rejects.toThrow('database away');
  });
});
