import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Controller, UseFilters, UseGuards } from '@nestjs/common';
import {
  Ctx,
  GrpcDataLossException,
  GrpcMethod,
  GrpcStreamCall,
  Payload,
} from '@nestjs/microservices';
import type { sendUnaryData, ServerReadableStream } from '@grpc/grpc-js';
import { InvalidRecordError, type Json } from '@app/plugin-sdk';
import { HubIngest } from '../../application/hub-ingest.js';
import { ConnectorGuard, ConnectorPortal } from './connector.guard.js';
import { IngestErrorsFilter } from './ingest-errors.filter.js';
import type {
  ContentChunk,
  ContentResult,
  CourseRecord,
  FileRecord,
  ItemRecord,
  Ref,
  State,
  Timestamp,
} from './messages.js';

const parseJson = (text: string | undefined): Json | undefined => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new InvalidRecordError(['not valid json']);
  }
};

const toDate = (t: Timestamp | undefined) =>
  t && new Date(t.seconds * 1000 + (t.nanos ?? 0) / 1e6);

// The gRPC face of HubIngest for connectors running as separate services.
@Controller()
@UseGuards(ConnectorGuard)
@UseFilters(IngestErrorsFilter)
export class IngestGrpcController {
  constructor(private readonly hub: HubIngest) {}

  @GrpcMethod('Ingest', 'Course')
  course(@Payload() record: CourseRecord, @ConnectorPortal() portal: string) {
    return this.hub.forPortal(portal).course({
      externalId: record.externalId,
      name: record.name,
      url: record.url,
      meta: parseJson(record.metaJson),
    });
  }

  @GrpcMethod('Ingest', 'Item')
  item(@Payload() record: ItemRecord, @ConnectorPortal() portal: string) {
    return this.hub.forPortal(portal).item({
      externalId: record.externalId,
      course: record.course,
      kind: record.kind,
      title: record.title,
      url: record.url,
      publishedAt: toDate(record.publishedAt),
      raw: parseJson(record.rawJson) as Json,
    });
  }

  @GrpcMethod('Ingest', 'File')
  file(@Payload() record: FileRecord, @ConnectorPortal() portal: string) {
    return this.hub.forPortal(portal).file({
      externalId: record.externalId,
      course: record.course,
      item: record.item,
      name: record.name,
      path: record.path,
      url: record.url,
      size: record.size,
      mime: record.mime,
      updatedAt: toDate(record.updatedAt),
    });
  }

  // Client stream: the file's id, its bytes, then their sha256.
  // The call is read only as fast as storage writes, so gRPC flow control
  // holds the connector back instead of the hub buffering the file.
  @GrpcStreamCall('Ingest', 'Content')
  async content(
    @Payload() call: ServerReadableStream<ContentChunk, ContentResult>,
    @Ctx() callback: sendUnaryData<ContentResult>,
    @ConnectorPortal() portal: string,
  ) {
    const ingest = this.hub.forPortal(portal);
    const messages: AsyncIterator<ContentChunk> = call[Symbol.asyncIterator]();
    const first = await messages.next();
    if (first.done || !first.value.externalId)
      throw new InvalidRecordError(['the first message names the file']);

    // fails unless the stream ends with a matching sha256, and then storage
    // keeps nothing
    async function* bytes() {
      const hash = createHash('sha256');
      for (let m = await messages.next(); !m.done; m = await messages.next()) {
        const { data, sha256 } = m.value;
        if (data) {
          hash.update(data);
          yield data;
        } else if (sha256 !== undefined) {
          if (!(await messages.next()).done)
            throw new InvalidRecordError(['sha256 is the last message']);
          if (sha256.toLowerCase() !== hash.digest('hex'))
            throw new GrpcDataLossException('content does not match sha256');
          return;
        } else {
          throw new InvalidRecordError([
            'after the file id: data, then sha256',
          ]);
        }
      }
      throw new InvalidRecordError(['the content ends with its sha256']);
    }
    callback(
      null,
      await ingest.content(first.value.externalId, Readable.from(bytes())),
    );
  }

  @GrpcMethod('Ingest', 'RemoveItem')
  removeItem(
    @Payload() { externalId }: Ref,
    @ConnectorPortal() portal: string,
  ) {
    return this.hub.forPortal(portal).remove('item', externalId);
  }

  @GrpcMethod('Ingest', 'RemoveFile')
  removeFile(
    @Payload() { externalId }: Ref,
    @ConnectorPortal() portal: string,
  ) {
    return this.hub.forPortal(portal).remove('file', externalId);
  }

  @GrpcMethod('Ingest', 'GetState')
  async getState(@ConnectorPortal() portal: string): Promise<State> {
    const state = await this.hub.forPortal(portal).state();
    return state === null ? {} : { json: JSON.stringify(state) };
  }

  @GrpcMethod('Ingest', 'SaveState')
  async saveState(
    @Payload() { json }: State,
    @ConnectorPortal() portal: string,
  ) {
    const ingest = this.hub.forPortal(portal);
    // "null" clears it; a missing field is more likely a mistake
    if (json === undefined) throw new InvalidRecordError(['json is required']);
    await ingest.saveState(parseJson(json) as Json);
    return {};
  }
}
