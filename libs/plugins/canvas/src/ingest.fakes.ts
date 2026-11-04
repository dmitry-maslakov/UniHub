import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import {
  ContentHash,
  UnknownReferenceError,
  type CourseRecord,
  type FileRecord,
  type ItemRecord,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';

// What the hub would keep of a connector's run, as the hub refuses a
// reference to what wasn't sent first. Sent again, a record replaces the
// one before; the hub has a file's content once content() got it.
export class RecordingIngest implements PortalIngest {
  readonly courses = new Map<string, CourseRecord>();
  readonly items = new Map<string, ItemRecord>();
  readonly files = new Map<string, FileRecord>();
  readonly contents = new Map<string, string>();
  readonly removedItems: string[] = [];
  readonly removedFiles: string[] = [];
  saved: Json | null = null;

  async course(record: CourseRecord) {
    this.courses.set(record.externalId, record);
    return { changed: true };
  }

  async item(record: ItemRecord) {
    this.known(this.courses, record.course);
    this.items.set(record.externalId, record);
    return { changed: true };
  }

  async file(record: FileRecord) {
    this.known(this.courses, record.course);
    this.known(this.items, record.item);
    this.files.set(record.externalId, record);
    return {
      changed: true,
      needsContent: !this.contents.has(record.externalId),
    };
  }

  async content(fileExternalId: string, content: Readable) {
    this.known(this.files, fileExternalId);
    const body = await text(content);
    this.contents.set(fileExternalId, body);
    const hash = createHash('sha256').update(body).digest('hex');
    return { hash: ContentHash.parse(hash), changed: true };
  }

  async removeItem(externalId: string) {
    this.removedItems.push(externalId);
    return { changed: this.items.delete(externalId) };
  }

  async removeFile(externalId: string) {
    this.removedFiles.push(externalId);
    return { changed: this.files.delete(externalId) };
  }

  async state() {
    return this.saved;
  }

  async saveState(state: Json) {
    // as the hub keeps it: a copy, not the connector's object
    this.saved = structuredClone(state);
  }

  private known(records: Map<string, unknown>, id: string | undefined) {
    if (id !== undefined && !records.has(id))
      throw new UnknownReferenceError(id);
  }
}
