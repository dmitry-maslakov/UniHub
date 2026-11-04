import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import {
  Ctx,
  GrpcMethod,
  GrpcStreamCall,
  Payload,
} from '@nestjs/microservices';
import type { sendUnaryData, ServerReadableStream } from '@grpc/grpc-js';
import { IngestService } from '../../application/ingest.service.js';
import type { Connection } from '../../domain/connection.js';
import { ConnectorConnection, ConnectorGuard } from './connector.guard.js';
import { verifiedContent } from './content-stream.js';
import type { ContentChunk__Output } from './generated/unihub/ingest/v1/ContentChunk.js';
import type { ContentResult } from './generated/unihub/ingest/v1/ContentResult.js';
import type { CourseRecord__Output } from './generated/unihub/ingest/v1/CourseRecord.js';
import type { FileRecord__Output } from './generated/unihub/ingest/v1/FileRecord.js';
import type { ItemRecord__Output } from './generated/unihub/ingest/v1/ItemRecord.js';
import type { Ref__Output } from './generated/unihub/ingest/v1/Ref.js';
import type { State__Output } from './generated/unihub/ingest/v1/State.js';
import { IngestErrorsFilter } from './ingest-errors.filter.js';
import {
  courseOf,
  fileOf,
  itemOf,
  stateOf,
  toStateMessage,
} from './proto.mapper.js';

// IngestService for connectors running as separate services
@Controller()
@UseGuards(ConnectorGuard)
@UseFilters(IngestErrorsFilter)
export class IngestGrpcController {
  constructor(private readonly ingest: IngestService) {}

  @GrpcMethod('Ingest', 'Course')
  course(
    @Payload() record: CourseRecord__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    return this.ingest.course(connection, courseOf(record));
  }

  @GrpcMethod('Ingest', 'Item')
  item(
    @Payload() record: ItemRecord__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    return this.ingest.item(connection, itemOf(record));
  }

  @GrpcMethod('Ingest', 'File')
  file(
    @Payload() record: FileRecord__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    return this.ingest.file(connection, fileOf(record));
  }

  // a client stream, answered once the content is stored
  @GrpcStreamCall('Ingest', 'Content')
  async content(
    @Payload() call: ServerReadableStream<ContentChunk__Output, ContentResult>,
    @Ctx() callback: sendUnaryData<ContentResult>,
    @ConnectorConnection() connection: Connection,
  ) {
    const { externalId, content } = await verifiedContent(call);
    callback(null, await this.ingest.content(connection, externalId, content));
  }

  @GrpcMethod('Ingest', 'RemoveItem')
  removeItem(
    @Payload() { externalId }: Ref__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    return this.ingest.removeItem(connection, externalId);
  }

  @GrpcMethod('Ingest', 'RemoveFile')
  removeFile(
    @Payload() { externalId }: Ref__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    return this.ingest.removeFile(connection, externalId);
  }

  @GrpcMethod('Ingest', 'GetState')
  async getState(@ConnectorConnection() connection: Connection) {
    return toStateMessage(await this.ingest.state(connection));
  }

  @GrpcMethod('Ingest', 'SaveState')
  async saveState(
    @Payload() state: State__Output,
    @ConnectorConnection() connection: Connection,
  ) {
    await this.ingest.saveState(connection, stateOf(state));
    return {};
  }
}
