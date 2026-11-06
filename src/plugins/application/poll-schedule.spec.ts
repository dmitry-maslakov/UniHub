import { Logger } from '@nestjs/common';
import {
  catalogOf,
  directoryOf,
  poll,
  push,
} from '../../../test/discovered-plugins.js';
import type { Connection } from '../../ingest/contracts.js';
import type { ConnectionDirectory } from './connection-directory.js';
import type { ConnectorSchedules, Schedule } from './connector-schedules.js';
import { PollSchedule } from './poll-schedule.js';

// schedules as a queue would keep them, refusing those of `refused` portals
function schedules(...refused: string[]) {
  const set: Schedule[] = [];
  const kept: (readonly Connection[])[] = [];
  const fake = {
    set: async (s: Schedule) => {
      if (refused.includes(s.connection.portal)) throw new Error('refused');
      set.push(s);
    },
    keepOnly: async (c: readonly Connection[]) => void kept.push(c),
  } as ConnectorSchedules;
  return { fake, set, kept };
}

const pollSchedule = (
  fake: ConnectorSchedules,
  directory: ConnectionDirectory = directoryOf(),
) =>
  new PollSchedule(
    catalogOf({
      polls: [poll('moodle'), poll('canvas')],
      pushes: [push('teams', { run: async () => {} })],
    }),
    directory,
    fake,
  );

describe('PollSchedule', () => {
  afterEach(() => vi.restoreAllMocks());

  it("schedules each poll connector's connections, and drops the rest", async () => {
    const { fake, set, kept } = schedules();

    await pollSchedule(fake).apply();

    expect(
      set.map(({ connection, repeat }) => [connection.key, repeat]),
    ).toEqual([
      ['moodle__shared', { pattern: '0 0 1 1 *' }],
      ['canvas__shared', { pattern: '0 0 1 1 *' }],
    ]);
    expect(kept[0].map((c) => c.key)).toEqual([
      'moodle__shared',
      'canvas__shared',
    ]);
  });

  it('logs a schedule that is not set by its connection, and sets the others', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { fake, set, kept } = schedules('moodle');

    await pollSchedule(fake).apply();

    expect(error).toHaveBeenCalledWith(
      `moodle__shared's poll schedule {"pattern":"0 0 1 1 *"} wasn't set`,
      expect.stringContaining('refused'),
    );
    expect(set.map((s) => s.connection.key)).toEqual(['canvas__shared']);
    // still wanted: its old schedule, if any, stays
    expect(kept[0].map((c) => c.key)).toContain('moodle__shared');
  });

  it("puts each user's own account of a portal read with them on its grid, and no shared one", async () => {
    const { fake, set } = schedules();
    const directory = directoryOf({ canvas: ['ana', 'bo'] });

    await pollSchedule(fake, directory).apply();

    const grid = (account: string) => {
      const { everyMs, offsetMs } = directory.gridOf(
        set.find((s) => s.connection.account === account)!.connection,
      );
      return { every: everyMs, offset: offsetMs };
    };
    expect(
      set.map(({ connection, repeat }) => [connection.key, repeat]),
    ).toEqual([
      ['moodle__shared', { pattern: '0 0 1 1 *' }],
      ['canvas__ana', grid('ana')],
      ['canvas__bo', grid('bo')],
    ]);
    expect(grid('ana')).not.toEqual(grid('bo'));
    expect(grid('ana').every).toBe(60 * 60_000);
  });

  it("removes no schedule when the portals' accounts can't be read", async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockReturnValue();
    const { fake, set, kept } = schedules();
    const directory = directoryOf();
    vi.spyOn(directory, 'connections').mockRejectedValue(new Error('db away'));

    await pollSchedule(fake, directory).apply();

    expect([set, kept]).toEqual([[], []]);
    expect(error).toHaveBeenCalledWith(
      "the portals' accounts weren't read",
      expect.stringContaining('db away'),
    );
  });
});
