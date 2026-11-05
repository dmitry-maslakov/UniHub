import { Logger } from '@nestjs/common';
import { catalogOf, poll, push } from '../../../test/discovered-plugins.js';
import type { Connection, IngestService } from '../../ingest/contracts.js';
import { ConnectionDirectory } from './connection-directory.js';
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

const pollSchedule = (fake: ConnectorSchedules) =>
  new PollSchedule(
    catalogOf({
      polls: [poll('moodle'), poll('canvas')],
      pushes: [push('teams', { run: async () => {} })],
    }),
    new ConnectionDirectory({} as IngestService),
    fake,
  );

describe('PollSchedule', () => {
  afterEach(() => vi.restoreAllMocks());

  it("schedules each poll connector's connections, and drops the rest", async () => {
    const { fake, set, kept } = schedules();

    await pollSchedule(fake).apply();

    expect(
      set.map(({ connection, pattern }) => [connection.key, pattern]),
    ).toEqual([
      ['moodle__shared', '0 0 1 1 *'],
      ['canvas__shared', '0 0 1 1 *'],
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
      `moodle__shared's poll schedule "0 0 1 1 *" wasn't set`,
      expect.stringContaining('refused'),
    );
    expect(set.map((s) => s.connection.key)).toEqual(['canvas__shared']);
    // still wanted: its old schedule, if any, stays
    expect(kept[0].map((c) => c.key)).toContain('moodle__shared');
  });
});
