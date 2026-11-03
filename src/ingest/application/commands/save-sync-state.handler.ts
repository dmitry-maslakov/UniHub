import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SyncStateRepository } from '../../domain/sync-state.js';
import { SaveSyncStateCommand } from './save-sync-state.command.js';

@CommandHandler(SaveSyncStateCommand)
export class SaveSyncStateHandler implements ICommandHandler<SaveSyncStateCommand> {
  constructor(private readonly states: SyncStateRepository) {}

  execute({ portal, state }: SaveSyncStateCommand) {
    return this.states.save(portal, state);
  }
}
