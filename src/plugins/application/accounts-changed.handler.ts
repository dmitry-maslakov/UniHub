import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForgetAccountCommand } from '../../catalog/contracts.js';
import { Connection, IngestService } from '../../ingest/contracts.js';
import { AccountsChangedCommand } from './accounts.js';
import { ConnectorSchedules } from './connector-schedules.js';
import { PollSchedule } from './poll-schedule.js';

// A linked account is put on its grid and polled now, its first view
// coming at once rather than a period later; a gone one's schedule goes,
// with what its runs saved (ingest) and what it saw (catalog). Each
// connection on its own, so two at once don't undo each other's.
@CommandHandler(AccountsChangedCommand)
export class AccountsChangedHandler implements ICommandHandler<AccountsChangedCommand> {
  constructor(
    private readonly schedule: PollSchedule,
    private readonly schedules: ConnectorSchedules,
    private readonly ingest: IngestService,
    private readonly commands: CommandBus,
  ) {}

  async execute({ portal, change }: AccountsChangedCommand) {
    for (const account of change.gone ?? []) {
      const connection = Connection.of({ portal, account });
      await this.schedules.remove(connection);
      await this.ingest.forget(connection);
      await this.commands.execute(new ForgetAccountCommand(account));
    }
    for (const account of change.linked ?? []) {
      const connection = Connection.of({ portal, account });
      const schedule = this.schedule.scheduleOf(connection);
      if (!schedule) continue;
      await this.schedules.set(schedule);
      await this.schedules.pollNow(connection);
    }
  }
}
