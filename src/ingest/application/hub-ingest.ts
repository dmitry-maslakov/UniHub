import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ZodError } from 'zod';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type PortalIngest,
} from '@app/plugin-sdk';
import * as catalog from '../../catalog/contracts.js';
import { PutContentCommand } from '../../storage/contracts.js';
import { SyncStateRepository, type Json } from '../domain/sync-state.js';
import { courseRecord, toFileInput, toItemInput } from './records.js';

// errors plugins see are the sdk's, not catalog's or zod's
async function asPluginErrors<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof catalog.UnknownReferenceError)
      throw new UnknownReferenceError(err.externalId);
    if (err instanceof ZodError)
      throw new InvalidRecordError(
        err.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
    throw err;
  }
}

// What a connector gets: validates and maps its records, then hands them to
// catalog and storage. The gRPC service will use the same.
@Injectable()
export class HubIngest {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly states: SyncStateRepository,
  ) {}

  forPortal(portal: string, account = 'shared'): PortalIngest {
    const run = asPluginErrors;
    return {
      course: (record) =>
        run(async () => {
          const course = courseRecord.parse(record);
          const { changed } = await this.commands.execute(
            new catalog.UpsertPortalCourseCommand({ ...course, portal }),
          );
          return { changed };
        }),
      item: (record) =>
        run(async () => {
          const { changed } = await this.commands.execute(
            new catalog.UpsertItemCommand(toItemInput(portal, record)),
          );
          return { changed };
        }),
      file: (record) =>
        run(async () => {
          const { changed, needsContent } = await this.commands.execute(
            new catalog.UpsertFileCommand(toFileInput(portal, record)),
          );
          return { changed, needsContent };
        }),
      content: (externalId, content) =>
        run(() => this.content(portal, externalId, content)),
      remove: (kind, externalId) => {
        // with per-user accounts "can't see it" isn't "gone for everyone"
        if (account !== 'shared')
          throw new Error('only shared accounts can remove records');
        return this.commands.execute(
          kind === 'item'
            ? new catalog.RemoveItemCommand(portal, externalId)
            : new catalog.RemoveFileCommand(portal, externalId),
        );
      },
      state: () => this.states.get(portal, account),
      saveState: (state) => this.states.save(portal, account, state as Json),
    };
  }

  private async content(portal: string, externalId: string, content: Readable) {
    // check first, so content of an unknown file isn't stored for nothing
    const file = await this.queries.execute(
      new catalog.FindFileQuery(portal, externalId),
    );
    if (!file) {
      content.destroy();
      throw new catalog.UnknownReferenceError(portal, externalId);
    }
    const { hash } = await this.commands.execute(
      new PutContentCommand(content),
    );
    const { changed } = await this.commands.execute(
      new catalog.SetFileContentCommand(file.id, hash),
    );
    return { hash, changed };
  }
}
