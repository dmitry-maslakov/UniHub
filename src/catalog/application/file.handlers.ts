import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Transactional } from '@nestjs-cls/transactional';
import { UnknownReferenceError } from '../domain/errors.js';
import { placeFile } from '../domain/portal-file/placement.js';
import { PortalFile } from '../domain/portal-file/portal-file.js';
import { PortalFileRepository } from '../domain/portal-file/portal-file.repository.js';
import {
  RemoveFileCommand,
  SetFileContentCommand,
  UpsertFileCommand,
} from './commands.js';
import { References } from './references.js';

@CommandHandler(UpsertFileCommand)
export class UpsertFileHandler implements ICommandHandler<UpsertFileCommand> {
  constructor(
    private readonly files: PortalFileRepository,
    private readonly references: References,
  ) {}

  @Transactional()
  async execute({
    data: { portal, externalId, course, item, ...props },
  }: UpsertFileCommand) {
    const placement = placeFile(
      await this.references.courseNamed(portal, course),
      await this.references.itemNamed(portal, item),
    );
    const ref = { portal, externalId };
    const found = await this.files.getForUpdate(ref);
    const file = found ?? PortalFile.create(ref, props, placement);
    const changed = found ? found.sync(props, placement) : true;
    await this.files.save(file);
    return { id: file.id, changed, needsContent: file.needsContent };
  }
}

// under the same lock as a sync of the file, so neither writes over what
// the other just stored
@CommandHandler(SetFileContentCommand)
export class SetFileContentHandler implements ICommandHandler<SetFileContentCommand> {
  constructor(private readonly files: PortalFileRepository) {}

  @Transactional()
  async execute({ file: ref, hash }: SetFileContentCommand) {
    const file = await this.files.getForUpdate(ref);
    if (!file) throw new UnknownReferenceError(ref.portal, ref.externalId);
    const changed = file.storeContent(hash);
    await this.files.save(file);
    return { changed };
  }
}

@CommandHandler(RemoveFileCommand)
export class RemoveFileHandler implements ICommandHandler<RemoveFileCommand> {
  constructor(private readonly files: PortalFileRepository) {}

  @Transactional()
  async execute({ file: ref }: RemoveFileCommand) {
    const file = await this.files.getForUpdate(ref);
    if (!file) return { changed: false };
    const changed = file.remove();
    await this.files.save(file);
    return { changed };
  }
}
