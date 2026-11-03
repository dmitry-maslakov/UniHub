import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Outbox } from '@nestjs/outbox';
import { FILE_CONTENT_STORED, type FileContentStored } from '@app/plugin-sdk';
import { SetFileContentCommand } from '../../../catalog/application/commands/set-file-content.command.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { PutContentCommand } from '../../../storage/application/commands/put-content.command.js';
import { IngestFileContentCommand } from './ingest-file-content.command.js';

@CommandHandler(IngestFileContentCommand)
export class IngestFileContentHandler implements ICommandHandler<IngestFileContentCommand> {
  constructor(
    private readonly commands: CommandBus,
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
    private readonly outbox: Outbox,
  ) {}

  async execute({ portal, externalId, content }: IngestFileContentCommand) {
    // storing the same content twice is harmless, so it happens outside
    // the transaction; the file's hash and the message commit together
    const { hash } = await this.commands.execute(
      new PutContentCommand(content),
    );

    const changed = await this.txHost.withTransaction(async () => {
      const { fileId, changed } = await this.commands.execute(
        new SetFileContentCommand(portal, externalId, hash),
      );
      if (changed)
        await this.outbox.add<FileContentStored>(this.txHost.tx, {
          topic: FILE_CONTENT_STORED,
          payload: { portal, fileId, hash },
        });
      return changed;
    });

    if (changed) this.outbox.notify();
    return { hash, changed };
  }
}
