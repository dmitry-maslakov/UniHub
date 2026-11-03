import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Controller, UseFilters } from '@nestjs/common';
import {
  GrpcDataLossException,
  GrpcMethod,
  GrpcStreamCall,
} from '@nestjs/microservices';
import type {
  Metadata,
  sendUnaryData,
  ServerReadableStream,
} from '@grpc/grpc-js';
import { InvalidRecordError, type Json } from '@app/plugin-sdk';
import { HubIngest } from '../../application/hub-ingest.js';
import { ConnectorTokens } from './connector-tokens.js';
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
@UseFilters(IngestErrorsFilter)
export class IngestGrpcController {
  constructor(
    private readonly hub: HubIngest,
    private readonly tokens: ConnectorTokens,
  ) {}

  // the token decides the portal, so it's resolved where ingest gets bound
  private ingest(metadata: Metadata) {
    return this.hub.forPortal(this.tokens.portalOf(metadata));
  }

  @GrpcMethod('Ingest', 'Course')
  course(record: CourseRecord, metadata: Metadata) {
    return this.ingest(metadata).course({
      externalId: record.externalId,
      name: record.name,
      url: record.url,
      meta: parseJson(record.metaJson),
    });
  }

  @GrpcMethod('Ingest', 'Item')
  item(record: ItemRecord, metadata: Metadata) {
    return this.ingest(metadata).item({
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
  file(record: FileRecord, metadata: Metadata) {
    return this.ingest(metadata).file({
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
    call: ServerReadableStream<ContentChunk, ContentResult>,
    callback: sendUnaryData<ContentResult>,
  ) {
    const ingest = this.ingest(call.metadata);
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
  removeItem({ externalId }: Ref, metadata: Metadata) {
    return this.ingest(metadata).remove('item', externalId);
  }

  @GrpcMethod('Ingest', 'RemoveFile')
  removeFile({ externalId }: Ref, metadata: Metadata) {
    return this.ingest(metadata).remove('file', externalId);
  }

  @GrpcMethod('Ingest', 'GetState')
  async getState(_: unknown, metadata: Metadata): Promise<State> {
    const state = await this.ingest(metadata).state();
    return state === null ? {} : { json: JSON.stringify(state) };
  }

  @GrpcMethod('Ingest', 'SaveState')
  async saveState({ json }: State, metadata: Metadata) {
    // "null" clears it; a missing field is more likely a mistake
    if (json === undefined) throw new InvalidRecordError(['json is required']);
    await this.ingest(metadata).saveState(parseJson(json) as Json);
    return {};
  }
}
