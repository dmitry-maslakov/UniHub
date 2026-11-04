import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Outbox } from '@nestjs/outbox';
import * as catalog from '../../catalog/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import type { Connection } from '../domain/connection.js';
import { RemovalNotAllowedError } from '../domain/errors.js';
import { SyncStateRepository } from '../domain/sync-state.js';
import {
  toFileInput,
  toItemInput,
  toPortalCourseInput,
  toRef,
  toState,
} from './records.js';

// What a connector does, whichever way it talks to the hub: what it sends
// (records, ids, state) is checked here and handed to catalog and storage.
// Errors are domain errors; the adapters (the sdk's PortalIngest, gRPC)
// answer them their own way.
@Injectable()
export class IngestService {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
    private readonly states: SyncStateRepository,
    private readonly outbox: Outbox,
  ) {}

  async course(connection: Connection, raw: unknown) {
    const { changed } = await this.commands.execute(
      new catalog.UpsertPortalCourseCommand(
        toPortalCourseInput(connection, raw),
      ),
    );
    return { changed };
  }

  async item(connection: Connection, raw: unknown) {
    const { changed } = await this.commands.execute(
      new catalog.UpsertItemCommand(toItemInput(connection, raw)),
    );
    return this.notify({ changed });
  }

  async file(connection: Connection, raw: unknown) {
    const file = toFileInput(connection, raw);
    const { changed, needsContent } = await this.commands.execute(
      new catalog.UpsertFileCommand(file),
    );
    // storage would refuse it, and the connector would send it again on
    // every sync
    const tooLarge = (file.size ?? 0) > this.blobs.maxBytes;
    return this.notify({ changed, needsContent: needsContent && !tooLarge });
  }

  async content(connection: Connection, id: string, content: Readable) {
    // checked first, so content of an unknown file isn't stored for nothing
    const file = await this.knownFile(connection, id).catch((error) => {
      content.destroy();
      throw error;
    });
    const { hash } = await this.blobs.put(content);
    const { changed } = await this.commands.execute(
      new catalog.SetFileContentCommand(file, hash),
    );
    return this.notify({ hash, changed });
  }

  async removeItem(connection: Connection, id: unknown) {
    const item = this.removable(connection, id);
    return this.notify(
      await this.commands.execute(new catalog.RemoveItemCommand(item)),
    );
  }

  async removeFile(connection: Connection, id: unknown) {
    const file = this.removable(connection, id);
    return this.notify(
      await this.commands.execute(new catalog.RemoveFileCommand(file)),
    );
  }

  state(connection: Connection) {
    return this.states.get(connection);
  }

  async saveState(connection: Connection, raw: unknown) {
    await this.states.save(connection, toState(raw));
  }

  private async knownFile(connection: Connection, id: string) {
    const file = toRef(connection, id);
    if (!(await this.queries.execute(new catalog.FindFileQuery(file))))
      throw new catalog.UnknownReferenceError(file.portal, file.externalId);
    return file;
  }

  private removable(connection: Connection, id: unknown) {
    if (!connection.mayRemoveRecords)
      throw new RemovalNotAllowedError(connection);
    return toRef(connection, id);
  }

  // a change committed a message; wake the relay instead of waiting for its poll
  private notify<T extends { changed: boolean }>(result: T) {
    if (result.changed) this.outbox.notify();
    return result;
  }
}
