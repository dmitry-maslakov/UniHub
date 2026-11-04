import type { Readable } from 'node:stream';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';
import { DomainError } from '@app/kernel';
import * as catalog from '../../../catalog/contracts.js';
import type { IngestService } from '../../application/ingest.service.js';
import type { Connection } from '../../domain/connection.js';
import { MalformedRecordError } from '../../domain/errors.js';

// The errors the sdk promises: whatever the hub refuses as invalid is a
// record the plugin should fix or skip, with the reason it was refused.
function asSdkError(error: unknown) {
  if (error instanceof catalog.UnknownReferenceError)
    return new UnknownReferenceError(error.externalId);
  if (error instanceof MalformedRecordError)
    return new InvalidRecordError(error.issues);
  if (error instanceof DomainError && error.kind === 'invalid')
    return new InvalidRecordError([error.message], error.reason);
  return error;
}

const sdk = <T>(work: Promise<T>) =>
  work.catch((error: unknown) => {
    throw asSdkError(error);
  });

// What an in-process connector gets as ctx.ingest: IngestService bound to
// the connector's connection.
export class SdkPortalIngest implements PortalIngest {
  constructor(
    private readonly ingest: IngestService,
    private readonly connection: Connection,
  ) {}

  course(record: CourseRecord) {
    return sdk(this.ingest.course(this.connection, record));
  }

  item(record: ItemRecord) {
    return sdk(this.ingest.item(this.connection, record));
  }

  file(record: FileRecord) {
    return sdk(this.ingest.file(this.connection, record));
  }

  content(fileExternalId: string, content: Readable) {
    return sdk(this.ingest.content(this.connection, fileExternalId, content));
  }

  removeItem(externalId: string) {
    return sdk(this.ingest.removeItem(this.connection, externalId));
  }

  removeFile(externalId: string) {
    return sdk(this.ingest.removeFile(this.connection, externalId));
  }

  state() {
    return sdk(this.ingest.state(this.connection));
  }

  saveState(state: Json) {
    return sdk(this.ingest.saveState(this.connection, state));
  }
}
