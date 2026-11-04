import type { IngestService } from '../../ingest/contracts.js';
import { ConnectionDirectory } from './connection-directory.js';
import type { ConnectorSchedules, Schedule } from './connector-schedules.js';
import { catalogOf, poll, push } from './plugins.fakes.js';
import { PollSchedule } from './poll-schedule.js';

describe('PollSchedule', () => {
  it("schedules each poll connector's connections, and nothing else", async () => {
    const replaced: (readonly Schedule[])[] = [];
    const schedules = {
      replace: async (s: readonly Schedule[]) => void replaced.push(s),
    } as ConnectorSchedules;
    const catalog = catalogOf({
      polls: [poll('acs'), poll('canvas')],
      pushes: [push('teams', { run: async () => {} })],
    });
    const schedule = new PollSchedule(
      catalog,
      new ConnectionDirectory({} as IngestService),
      schedules,
    );

    await schedule.onApplicationBootstrap();

    expect(
      replaced[0].map(({ connection, pattern }) => [connection.key, pattern]),
    ).toEqual([
      ['acs__shared', '0 0 1 1 *'],
      ['canvas__shared', '0 0 1 1 *'],
    ]);
  });
});
