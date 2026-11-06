import type { CommandBus } from '@nestjs/cqrs';
import { PortalId } from '@app/kernel';
import { FakeBus } from '../../../test/fake-bus.js';
import {
  catalogOf,
  directoryOf,
  poll,
} from '../../../test/discovered-plugins.js';
import { ForgetAccountCommand } from '../../catalog/contracts.js';
import type { Connection, IngestService } from '../../ingest/contracts.js';
import { AccountsChangedCommand } from './accounts.js';
import { AccountsChangedHandler } from './accounts-changed.handler.js';
import type { ConnectorSchedules, Schedule } from './connector-schedules.js';
import { PollSchedule } from './poll-schedule.js';

const lms = PortalId.parse('lms');

function handler() {
  const done: string[] = [];
  const schedules = {
    set: async ({ connection, repeat }: Schedule) =>
      void done.push(`set ${connection.key} ${'every' in repeat}`),
    remove: async (c: Connection) => void done.push(`remove ${c.key}`),
    pollNow: async (c: Connection) => void done.push(`poll ${c.key}`),
  } as unknown as ConnectorSchedules;
  const ingest = {
    forget: async (c: Connection) => void done.push(`forget ${c.key}`),
  } as unknown as IngestService;
  const commands = new FakeBus();
  const directory = directoryOf({ lms: [] });
  const catalog = catalogOf({ polls: [poll('lms')] });
  const changed = new AccountsChangedHandler(
    new PollSchedule(catalog, directory, schedules),
    schedules,
    ingest,
    commands.commands as CommandBus,
  );
  return { changed, done, sent: commands.sent };
}

describe('AccountsChangedHandler', () => {
  it('puts a linked account on its grid and polls it now; forgets a gone one, schedule, state and sights', async () => {
    const { changed, done, sent } = handler();
    await changed.execute(
      new AccountsChangedCommand(lms, { linked: ['bo'], gone: ['ana'] }),
    );

    expect(done).toEqual([
      'remove lms__ana',
      'forget lms__ana',
      'set lms__bo true',
      'poll lms__bo',
    ]);
    expect(sent).toEqual([new ForgetAccountCommand('ana')]);
  });

  it('schedules nothing of a portal no connector here polls', async () => {
    const { changed, done } = handler();
    await changed.execute(
      new AccountsChangedCommand(PortalId.parse('teams'), { linked: ['bo'] }),
    );
    expect(done).toEqual([]);
  });
});
