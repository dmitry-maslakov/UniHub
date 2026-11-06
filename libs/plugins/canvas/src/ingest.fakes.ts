import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import {
  ContentHash,
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

// What the hub would keep of one account's runs, as it refuses what the
// sdk says it does: a pass of a course the courses didn't name, a file's
// post the pass didn't send before it, content before end() or of a file
// locked for the account. A record sent again replaces the one before; at
// end() what the account saw of the course and the pass neither sent nor
// kept is removed; the hub has a file's content once content() got it.
export class RecordingIngest implements PortalIngest {
  readonly listedCourses = new Map<string, CourseRecord>();
  readonly items = new Map<string, ItemRecord>();
  readonly files = new Map<string, FileRecord>();
  // the files sent locked for the account, as of the last pass
  readonly locked = new Set<string>();
  readonly contents = new Map<string, string>();
  readonly removedItems: string[] = [];
  readonly removedFiles: string[] = [];
  saved: Json | null = null;

  async courses(records: CourseRecord[]) {
    this.listedCourses.clear();
    for (const record of records)
      this.listedCourses.set(record.externalId, record);
  }

  async pass(course: string): Promise<CoursePass> {
    if (!this.listedCourses.has(course))
      throw new UnknownReferenceError(course);
    const sent = { items: new Set<string>(), files: new Set<string>() };
    let ended = false;
    const open = () => {
      if (ended) throw new InvalidRecordError(['pass: ended']);
    };
    return {
      item: async (record: ItemRecord) => {
        open();
        this.items.set(record.externalId, { ...record, course });
        sent.items.add(record.externalId);
      },
      file: async (record: FileRecord, seen?: Seen) => {
        open();
        if (record.item !== undefined && !sent.items.has(record.item))
          throw new UnknownReferenceError(record.item);
        this.files.set(record.externalId, { ...record, course });
        sent.files.add(record.externalId);
        if (seen?.locked) this.locked.add(record.externalId);
        else this.locked.delete(record.externalId);
        return {
          fetch: !seen?.locked && !this.contents.has(record.externalId),
        };
      },
      end: async (kept = {}) => {
        open();
        ended = true;
        this.drop(
          this.items,
          course,
          sent.items,
          kept.items,
          this.removedItems,
        );
        this.drop(
          this.files,
          course,
          sent.files,
          kept.files,
          this.removedFiles,
        );
      },
      content: async (fileExternalId: string, content: Readable) => {
        if (!ended || !sent.files.has(fileExternalId))
          throw new UnknownReferenceError(fileExternalId);
        if (this.locked.has(fileExternalId))
          throw new InvalidRecordError(['locked']);
        const body = await text(content);
        this.contents.set(fileExternalId, body);
        const hash = createHash('sha256').update(body).digest('hex');
        return { hash: ContentHash.parse(hash) };
      },
    };
  }

  // Record by record is for the shared account of a portal that sends so
  // (gRPC); Canvas sends passes.
  async course(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async item(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async file(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async content(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async removeItem(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async removeFile(): Promise<never> {
    throw new Error('canvas sends passes');
  }

  async state() {
    return this.saved;
  }

  async saveState(state: Json) {
    // as the hub keeps it: a copy, not the connector's object
    this.saved = structuredClone(state);
  }

  private drop(
    records: Map<string, { course?: string }>,
    course: string,
    sent: Set<string>,
    kept: string[] = [],
    removed: string[],
  ) {
    for (const [id, record] of records)
      if (record.course === course && !sent.has(id) && !kept.includes(id)) {
        records.delete(id);
        removed.push(id);
      }
  }
}
