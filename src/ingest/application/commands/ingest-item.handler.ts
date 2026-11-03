import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Outbox } from '@nestjs/outbox';
import { ITEM_INGESTED, type ItemIngested } from '@app/plugin-sdk';
import { UpsertItemCommand } from '../../../catalog/application/commands/upsert-item.command.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { IngestItemCommand } from './ingest-item.command.js';

@CommandHandler(IngestItemCommand)
export class IngestItemHandler implements ICommandHandler<IngestItemCommand> {
  constructor(
    private readonly commands: CommandBus,
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
    private readonly outbox: Outbox,
  ) {}

  async execute({ portal, record }: IngestItemCommand) {
    // the item and the message about it commit together
    const changed = await this.txHost.withTransaction(async () => {
      const { entity, changed } = await this.commands.execute(
        new UpsertItemCommand({ portal, ...record }),
      );
      if (changed)
        await this.outbox.add<ItemIngested>(this.txHost.tx, {
          topic: ITEM_INGESTED,
          payload: { portal, itemId: entity.id },
        });
      return changed;
    });

    if (changed) this.outbox.notify();
    return { changed };
  }
}
