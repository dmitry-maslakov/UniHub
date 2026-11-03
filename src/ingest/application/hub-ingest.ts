import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Ingest, type PortalIngest } from '@app/plugin-sdk';
import {
  FindFileQuery,
  SetFileContentCommand,
  UnknownReferenceError,
  UpsertFileCommand,
  UpsertItemCommand,
  UpsertPortalCourseCommand,
} from '../../catalog/contracts.js';
import { PutContentCommand } from '../../storage/contracts.js';
import { SyncStateRepository, type Json } from '../domain/sync-state.js';
import { courseRecord, toFileInput, toItemInput } from './records.js';

// What plugins get from the sdk. Validates and maps their records, then hands
// them to catalog and storage; the gRPC service will do the same.
@Injectable()
export class HubIngest extends Ingest {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly states: SyncStateRepository,
  ) {
    super();
  }

  forPortal(portal: string): PortalIngest {
    return {
      course: async (record) => {
        const course = courseRecord.parse(record);
        const { changed } = await this.commands.execute(
          new UpsertPortalCourseCommand({ ...course, portal }),
        );
        return { changed };
      },
      item: async (record) => {
        const { changed } = await this.commands.execute(
          new UpsertItemCommand(toItemInput(portal, record)),
        );
        return { changed };
      },
      file: async (record) => {
        const { changed } = await this.commands.execute(
          new UpsertFileCommand(toFileInput(portal, record)),
        );
        return { changed };
      },
      content: (externalId, content) =>
        this.content(portal, externalId, content),
      state: () => this.states.get(portal),
      saveState: (state) => this.states.save(portal, state as Json),
    };
  }

  private async content(portal: string, externalId: string, content: Readable) {
    // check first, so content of an unknown file isn't stored for nothing
    const file = await this.queries.execute(
      new FindFileQuery(portal, externalId),
    );
    if (!file) {
      content.destroy();
      throw new UnknownReferenceError(portal, externalId);
    }
    const { hash } = await this.commands.execute(
      new PutContentCommand(content),
    );
    const { changed } = await this.commands.execute(
      new SetFileContentCommand(file.id, hash),
    );
    return { hash, changed };
  }
}
