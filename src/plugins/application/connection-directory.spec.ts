import { PortalId, Secret } from '@app/plugin-sdk';
import { directoryOf } from '../../../test/discovered-plugins.js';
import { Connection, type IngestService } from '../../ingest/contracts.js';

const lms = PortalId.parse('lms');
const credential = { kind: 'token' as const, token: new Secret('ana~1') };

describe('ConnectionDirectory', () => {
  it("runs a portal read as shared for the shared account, any other for its users' own accounts alone", async () => {
    const directory = directoryOf({ lms: ['ana', 'bo'] });
    const keys = async (portal: string) =>
      (await directory.connections(PortalId.parse(portal))).map((c) => c.key);

    expect(await keys('moodle')).toEqual(['moodle__shared']);
    expect(await keys('lms')).toEqual(['lms__ana', 'lms__bo']);
  });

  it("gives a user's account's run its credential, and shows what it finds at the slot it started in", async () => {
    const courses = vi.fn(async () => {});
    const directory = directoryOf({ lms: ['ana'] }, { ana: credential }, {
      courses,
    } as unknown as IngestService);
    const ana = Connection.of({ portal: lms, account: 'ana' });
    const { everyMs, offsetMs } = directory.gridOf(ana);
    const slot = Date.UTC(2026, 10, 6) + offsetMs;

    const ctx = await directory.context(
      ana,
      new AbortController().signal,
      new Date(slot + everyMs / 2),
    );
    await ctx!.ingest.courses([]);

    const [[, , run]] = courses.mock.calls as unknown as [
      [unknown, unknown, { shown: (ended: Date) => object }],
    ];
    // PUBLISH_DELAY_MINUTES and HOLD_MINUTES as they are by default
    expect(run.shown(new Date(slot + 60_000))).toEqual({
      shownFrom: new Date(slot + 10 * 60_000),
      openFrom: new Date(slot + 25 * 60_000),
    });
    expect(ctx!.account.kind).toBe('user');
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
    expect(
      (await directory.context(Connection.shared(lms), signal))!.account,
    ).toEqual({ kind: 'shared' });
  });
});
