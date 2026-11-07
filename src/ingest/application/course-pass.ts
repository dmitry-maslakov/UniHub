import type { Readable } from 'node:stream';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import * as catalog from '../../catalog/contracts.js';
import type { BlobStore } from '../../storage/contracts.js';
import type { Connection } from '../domain/connection.js';
import { MalformedRecordError } from '../domain/errors.js';
import type { FetchLeases } from '../domain/fetch-leases.js';
import { toFileInput, toItemInput, toRef } from './records.js';

// A run of a connection: when what its passes find shows. The shared
// account's shows at once; a user's account's at its slot, or as each
// pass ends in the account's first run (catalog's publication rule).
export interface Run {
  shown(ended: Date): catalog.Shown;
  // how long a file's fetch lease it takes holds: as long as the run may
  // take, as it downloads once its passes have ended
  leaseMs: number;
}

// the shared account's passes take no leases
export const sharedRun: Run = {
  shown: (ended) => catalog.atOnce(ended),
  leaseMs: 0,
};

// what the sdk's Seen says, checked
export interface Seen {
  locked: boolean;
}
export const toSeen = (seen: unknown): Seen => ({
  locked:
    typeof seen === 'object' &&
    seen !== null &&
    (seen as { locked?: unknown }).locked === true,
});

// what a pass needs of the hub
export interface PassPorts {
  commands: CommandBus;
  queries: QueryBus;
  blobs: BlobStore;
  leases: FetchLeases;
  // a change committed a message: wake the relay
  notify(): void;
}

interface SentFile {
  input: catalog.FileInput;
  locked: boolean;
}

// One account's view of one course, as a connector sends it (the sdk's
// CoursePass): records of the course, then end() with what's gone of what
// it sent before, then the content of its files. Whatever kind of account it is, the records are checked the same:
// of this course, a file's post one the pass sent before it.
export abstract class CoursePass {
  protected readonly items = new Map<string, catalog.ItemInput>();
  protected readonly files = new Map<string, SentFile>();
  private ended = false;

  constructor(
    protected readonly connection: Connection,
    protected readonly course: string,
    protected readonly ports: PassPorts,
  ) {}

  async item(raw: unknown, seen: unknown) {
    this.open();
    const input = this.ofCourse(toItemInput(this.connection, raw));
    this.items.set(input.externalId, input);
    await this.sendItem(input, toSeen(seen));
  }

  async file(raw: unknown, seen: unknown) {
    this.open();
    const input = this.ofCourse(toFileInput(this.connection, raw));
    if (input.item !== null && !this.items.has(input.item))
      throw new catalog.UnknownReferenceError(input.portal, input.item);
    const { locked } = toSeen(seen);
    this.files.set(input.externalId, { input, locked });
    // locked, or past what storage takes
    const fetchable = !locked && (input.size ?? 0) <= this.ports.blobs.maxBytes;
    const wanted = await this.sendFile(input, fetchable);
    return { fetch: fetchable && wanted };
  }

  // ended once the view is what it sent: one that fails may end again
  async end(gone: unknown) {
    this.open();
    await this.close(toGone(gone));
    this.ended = true;
  }

  async content(id: string, content: Readable) {
    try {
      const file = this.files.get(id);
      if (!this.ended)
        throw new MalformedRecordError(['content: comes after end()']);
      if (!file)
        throw new catalog.UnknownReferenceError(this.connection.portal, id);
      if (file.locked)
        throw new MalformedRecordError(['content: locked for the account']);
      return await this.store(file.input, content);
    } catch (error) {
      content.destroy();
      throw error;
    }
  }

  protected abstract sendItem(
    input: catalog.ItemInput,
    seen: Seen,
  ): Promise<void>;
  // whether the hub wants its bytes from this run, as far as it knows
  protected abstract sendFile(
    input: catalog.FileInput,
    fetchable: boolean,
  ): Promise<boolean>;
  protected abstract close(gone: Gone): Promise<void>;
  protected abstract store(
    input: catalog.FileInput,
    content: Readable,
  ): Promise<{ hash: ContentHash }>;

  private open() {
    if (this.ended)
      throw new MalformedRecordError(['pass: ended, send content only']);
  }

  // none names this course; another course is another pass's
  private ofCourse<T extends { course: string | null }>(input: T): T {
    if (input.course !== null && input.course !== this.course)
      throw new MalformedRecordError([
        `course: ${input.course}, in a pass of ${this.course}`,
      ]);
    return { ...input, course: this.course };
  }
}

// of what the account saw before, what a listing that went through no
// longer has, by the portal's ids
export interface Gone {
  items: string[];
  files: string[];
}

const ids = (value: unknown) =>
  Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];

const toGone = (gone: unknown): Gone => {
  const { items, files } = (gone ?? {}) as Partial<Record<keyof Gone, unknown>>;
  return { items: ids(items), files: ids(files) };
};

// The shared account's pass: its records go to catalog one by one as they
// come, as they always did, and end() removes what's gone, unless the pass
// sent it after all.
export class SharedPass extends CoursePass {
  protected async sendItem(input: catalog.ItemInput) {
    const { changed } = await this.ports.commands.execute(
      new catalog.UpsertItemCommand(input),
    );
    if (changed) this.ports.notify();
  }

  protected async sendFile(input: catalog.FileInput) {
    const { changed, needsContent } = await this.ports.commands.execute(
      new catalog.UpsertFileCommand(input),
    );
    if (changed) this.ports.notify();
    return needsContent;
  }

  protected async close(gone: Gone) {
    const ref = (id: string) => toRef(this.connection, id);
    for (const id of gone.items.filter((id) => !this.items.has(id)))
      await this.removed(new catalog.RemoveItemCommand(ref(id)));
    for (const id of gone.files.filter((id) => !this.files.has(id)))
      await this.removed(new catalog.RemoveFileCommand(ref(id)));
  }

  protected async store(input: catalog.FileInput, content: Readable) {
    const { hash } = await this.ports.blobs.put(content);
    const { changed } = await this.ports.commands.execute(
      new catalog.SetFileContentCommand(refOf(input), hash),
    );
    if (changed) this.ports.notify();
    return { hash };
  }

  private async removed(
    command: catalog.RemoveItemCommand | catalog.RemoveFileCommand,
  ) {
    const { changed } = await this.ports.commands.execute(command);
    if (changed) this.ports.notify();
  }
}

// A user's own account's pass: nothing goes to catalog till end(), which
// makes what it sent the account's view of the course, shown when the
// run's publication says. A file's bytes are fetched by the first run that
// sees that version of them open and takes its lease, unless the hub has
// them already.
export class AccountPass extends CoursePass {
  private readonly seen = new Map<string, boolean>();

  constructor(
    connection: Connection,
    course: string,
    ports: PassPorts,
    private readonly run: Run,
  ) {
    super(connection, course, ports);
  }

  protected async sendItem(input: catalog.ItemInput, { locked }: Seen) {
    this.seen.set(input.externalId, !locked);
  }

  protected async sendFile(input: catalog.FileInput, fetchable: boolean) {
    if (!fetchable) return false;
    const file = refOf(input);
    const stamp = stampOf(input);
    const has = await this.ports.queries.execute(
      new catalog.HasBytesQuery(file, stamp),
    );
    return (
      !has &&
      this.ports.leases.take(JSON.stringify([file, stamp]), this.run.leaseMs)
    );
  }

  protected async close(gone: Gone) {
    const { portal, instance, account } = this.connection;
    const items = [...this.items.values()].map((record) => ({
      record,
      open: this.seen.get(record.externalId) ?? true,
    }));
    const files = [...this.files.values()].map(({ input, locked }) => ({
      record: input,
      open: !locked,
    }));
    await this.ports.commands.execute(
      new catalog.ViewCourseCommand(
        account,
        { portal, instance },
        this.course,
        items,
        files,
        gone,
        this.run.shown(new Date()),
      ),
    );
    if (items.length || files.length) this.ports.notify();
  }

  protected async store(input: catalog.FileInput, content: Readable) {
    const { hash } = await this.ports.blobs.put(content);
    const { changed } = await this.ports.commands.execute(
      new catalog.StoreBytesCommand(refOf(input), stampOf(input), hash),
    );
    if (changed) this.ports.notify();
    return { hash };
  }
}

// a record's ref, of what toRef gave it
const refOf = ({ portal, instance, externalId }: catalog.FileInput) => ({
  portal,
  instance,
  externalId,
});

// what the portal says of a file's bytes
const stampOf = ({ size, sourceUpdatedAt }: catalog.FileInput) => ({
  size,
  sourceUpdatedAt,
});
