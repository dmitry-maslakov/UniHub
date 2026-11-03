import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  Ingest,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';
import { IngestCourseCommand } from './commands/ingest-course.command.js';
import { IngestFileContentCommand } from './commands/ingest-file-content.command.js';
import { IngestFileCommand } from './commands/ingest-file.command.js';
import { IngestItemCommand } from './commands/ingest-item.command.js';
import { SaveSyncStateCommand } from './commands/save-sync-state.command.js';
import { GetSyncStateQuery } from './queries/get-sync-state.query.js';

// what built-in connectors get from the sdk, the gRPC service will do the same
@Injectable()
export class HubIngest extends Ingest {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  forPortal(portal: string): PortalIngest {
    const { commands, queries } = this;
    return {
      course: (record: CourseRecord) =>
        commands.execute(new IngestCourseCommand(portal, record)),
      item: (record: ItemRecord) =>
        commands.execute(new IngestItemCommand(portal, record)),
      file: (record: FileRecord) =>
        commands.execute(new IngestFileCommand(portal, record)),
      content: (externalId: string, content: Readable) =>
        commands.execute(
          new IngestFileContentCommand(portal, externalId, content),
        ),
      state: () => queries.execute(new GetSyncStateQuery(portal)),
      saveState: (state: Json) =>
        commands.execute(new SaveSyncStateCommand(portal, state)),
    };
  }
}
