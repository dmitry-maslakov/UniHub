import { addAbortSignal, type Readable } from 'node:stream';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type CoursePass,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
  type Seen,
} from '@app/plugin-sdk';
import { DomainError } from '@app/kernel';
import * as catalog from '../../../catalog/contracts.js';
import { sharedRun, type Run } from '../../application/course-pass.js';
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

// What an in-process connector gets as ctx.ingest: IngestService bound to
// the connector's connection and run. Once the hub has let go of the run
// (stopped, past its time, its job taken over) every call is refused, so a
// connector that doesn't listen to ctx.signal can't write alongside the run
// that took over.
export class SdkPortalIngest implements PortalIngest {
  constructor(
    private readonly ingest: IngestService,
    private readonly connection: Connection,
    private readonly signal: AbortSignal,
    private readonly run: Run = sharedRun,
  ) {}

  courses(records: CourseRecord[]) {
    return this.sdk(() =>
      this.ingest.courses(this.connection, records, this.run),
    );
  }

  async pass(course: string): Promise<CoursePass> {
    const pass = await this.sdk(async () =>
      this.ingest.pass(this.connection, course, this.run),
    );
    return {
      item: (record: ItemRecord, seen?: Seen) =>
        this.sdk(() => pass.item(record, seen)),
      file: (record: FileRecord, seen?: Seen) =>
        this.sdk(() => pass.file(record, seen)),
      end: (kept) => this.sdk(() => pass.end(kept)),
      content: (fileExternalId: string, content: Readable) => {
        const cut = addAbortSignal(this.signal, content);
        return this.sdk(() => pass.content(fileExternalId, cut));
      },
    };
  }

  course(record: CourseRecord) {
    return this.sdk(() => this.ingest.course(this.connection, record));
  }

  item(record: ItemRecord) {
    return this.sdk(() => this.ingest.item(this.connection, record));
  }

  file(record: FileRecord) {
    return this.sdk(() => this.ingest.file(this.connection, record));
  }

  content(fileExternalId: string, content: Readable) {
    // an upload still going when the run is let go of is cut
    const cut = addAbortSignal(this.signal, content);
    return this.sdk(() =>
      this.ingest.content(this.connection, fileExternalId, cut),
    );
  }

  removeItem(externalId: string) {
    return this.sdk(() => this.ingest.removeItem(this.connection, externalId));
  }

  removeFile(externalId: string) {
    return this.sdk(() => this.ingest.removeFile(this.connection, externalId));
  }

  state() {
    return this.sdk(() => this.ingest.state(this.connection));
  }

  saveState(state: Json) {
    return this.sdk(() => this.ingest.saveState(this.connection, state));
  }

  private async sdk<T>(work: () => Promise<T>) {
    this.signal.throwIfAborted();
    return work().catch((error: unknown) => {
      throw asSdkError(error);
    });
  }
}
