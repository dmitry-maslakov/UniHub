import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { Instances } from '../domain/instances.js';
import { AdoptRecordsCommand } from './commands.js';

// in the transaction of whoever asks, beside the accounts' own (plugins'
// InstanceAdoption)
@CommandHandler(AdoptRecordsCommand)
export class AdoptRecordsHandler implements ICommandHandler<AdoptRecordsCommand> {
  constructor(private readonly instances: Instances) {}

  @Transactional()
  execute({ portal, instance }: AdoptRecordsCommand) {
    return this.instances.adopt(portal, instance);
  }
}
