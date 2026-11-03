import { PassThrough } from 'node:stream';
import { Controller } from '@nestjs/common';
import {
  GrpcMethod,
  GrpcStreamMethod,
  RpcException,
} from '@nestjs/microservices';
import { status, type Metadata } from '@grpc/grpc-js';
import { from, type Observable } from 'rxjs';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type Json,
} from '@app/plugin-sdk';
import { HubIngest } from '../../application/hub-ingest.js';
import { ConnectorTokens } from './connector-tokens.js';
import type {
  ContentChunk,
  CourseRecord,
  FileRecord,
  ItemRecord,
  Removal,
  State,
} from './messages.js';

const parseJson = (text: string | undefined): Json | undefined => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new InvalidRecordError(['not valid json']);
  }
};

// sdk errors become grpc statuses the connector can act on
async function asGrpc<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof RpcException) throw err;
    if (err instanceof InvalidRecordError)
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: err.message,
      });
    if (err instanceof UnknownReferenceError)
      throw new RpcException({
        code: status.FAILED_PRECONDITION,
        message: err.message,
      });
    throw err;
  }
}

// The gRPC face of HubIngest for connectors running as separate services.
@Controller()
export class IngestGrpcController {
  constructor(
    private readonly hub: HubIngest,
    private readonly tokens: ConnectorTokens,
  ) {}

  private ingest(metadata: Metadata) {
    return this.hub.forPortal(this.tokens.portalOf(metadata));
  }

  @GrpcMethod('Ingest', 'Course')
  course(record: CourseRecord, metadata: Metadata) {
    return asGrpc(() =>
      this.ingest(metadata).course({
        externalId: record.externalId,
        name: record.name,
        url: record.url,
        meta: parseJson(record.metaJson),
      }),
    );
  }

  @GrpcMethod('Ingest', 'Item')
  item(record: ItemRecord, metadata: Metadata) {
    return asGrpc(() =>
      this.ingest(metadata).item({
        externalId: record.externalId,
        course: record.course,
        kind: record.kind,
        title: record.title,
        url: record.url,
        // validated and coerced by ingest
        publishedAt: record.publishedAt as unknown as Date | undefined,
        raw: parseJson(record.rawJson) as Json,
      }),
    );
  }

  @GrpcMethod('Ingest', 'File')
  file(record: FileRecord, metadata: Metadata) {
    return asGrpc(() =>
      this.ingest(metadata).file({
        externalId: record.externalId,
        course: record.course,
        item: record.item,
        name: record.name,
        path: record.path,
        url: record.url,
        size: record.size,
        mime: record.mime,
        updatedAt: record.updatedAt as unknown as Date | undefined,
      }),
    );
  }

  // Client stream: the first message names the file, the rest is its bytes.
  // There's no backpressure from an Observable, so chunks are buffered while
  // the disk is slower than the network.
  // Returns an Observable, not a Promise: Nest hands over the messages only
  // once the handler has returned.
  @GrpcStreamMethod('Ingest', 'Content')
  content(messages: Observable<ContentChunk>, metadata: Metadata) {
    return from(
      asGrpc(
        () =>
          new Promise((resolve, reject) => {
            const ingest = this.ingest(metadata);
            const data = new PassThrough();
            let started = false;
            messages.subscribe({
              next: (chunk) => {
                if (started) {
                  if (!data.destroyed)
                    data.write(chunk.data ?? Buffer.alloc(0));
                  return;
                }
                started = true;
                if (!chunk.externalId)
                  return reject(
                    new InvalidRecordError([
                      'the first message names the file',
                    ]),
                  );
                ingest.content(chunk.externalId, data).then(resolve, (err) => {
                  // nobody reads the rest of the stream
                  data.destroy();
                  reject(err);
                });
              },
              error: (err: Error) => data.destroy(err),
              complete: () => {
                if (!started)
                  reject(new InvalidRecordError(['no content was sent']));
                data.end();
              },
            });
          }),
      ),
    );
  }

  @GrpcMethod('Ingest', 'Remove')
  remove({ kind, externalId }: Removal, metadata: Metadata) {
    return asGrpc(() =>
      this.ingest(metadata).remove(kind as 'item' | 'file', externalId),
    );
  }

  @GrpcMethod('Ingest', 'GetState')
  async getState(_: unknown, metadata: Metadata): Promise<State> {
    const state = await asGrpc(() => this.ingest(metadata).state());
    return state === null ? {} : { json: JSON.stringify(state) };
  }

  @GrpcMethod('Ingest', 'SaveState')
  async saveState({ json }: State, metadata: Metadata) {
    await asGrpc(() =>
      this.ingest(metadata).saveState(parseJson(json ?? 'null') as Json),
    );
    return {};
  }
}
