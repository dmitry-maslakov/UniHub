import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Timeout } from '@nestjs/schedule';
import { Transactional } from '@nestjs-cls/transactional';
import { AdoptRecordsCommand } from '../../catalog/contracts.js';
import { AdoptAccountsCommand } from './accounts.js';
import { PluginCatalog } from './plugin-catalog.js';

// Rows from before a portal's connector told its sites apart (README,
// Canvas): the records and users' accounts of a portal whose settings name
// its site, kept with none, are that site's, all of them in one
// transaction or none. Once a process, as the worker starts and before a
// run gets its context, so no run stamps a record of the site beside its
// old one; again by the next run if it failed. None left, it changes
// nothing.
@Injectable()
export class InstanceAdoption {
  private readonly logger = new Logger(InstanceAdoption.name);
  private adopted: Promise<void> | null = null;

  constructor(
    private readonly plugins: PluginCatalog,
    private readonly commands: CommandBus,
  ) {}

  // with the scheduler, so in a process that runs the background work
  @Timeout('adopt-instances', 0)
  async atStart() {
    await this.done().catch((error: Error) =>
      this.logger.error("old rows weren't given their site", error.stack),
    );
  }

  // once it went through in this process
  done() {
    this.adopted ??= this.adopt().catch((error: unknown) => {
      this.adopted = null;
      throw error;
    });
    return this.adopted;
  }

  @Transactional()
  private async adopt() {
    for (const { portal, instance } of this.plugins.configuredInstances) {
      const records = await this.commands.execute(
        new AdoptRecordsCommand(portal, instance),
      );
      const accounts = await this.commands.execute(
        new AdoptAccountsCommand(portal, instance),
      );
      if (records || accounts)
        this.logger.log(
          `${portal}: ${records} records and ${accounts} accounts are ${instance}'s now`,
        );
    }
  }
}
