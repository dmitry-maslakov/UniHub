import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { NoPollConnectorError } from '../domain/errors.js';
import { ConnectorSchedules } from './connector-schedules.js';
import { PluginCatalog } from './plugin-catalog.js';
import { SyncConnectionCommand } from './sync-connection.command.js';

@CommandHandler(SyncConnectionCommand)
export class SyncConnectionHandler implements ICommandHandler<SyncConnectionCommand> {
  constructor(
    private readonly catalog: PluginCatalog,
    private readonly schedules: ConnectorSchedules,
  ) {}

  async execute({ connection }: SyncConnectionCommand) {
    if (!this.catalog.pollConnector(connection.portal))
      throw new NoPollConnectorError(connection.portal);
    await this.schedules.pollNow(connection);
  }
}
