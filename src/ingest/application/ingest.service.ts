import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Outbox } from '@nestjs/outbox';
import * as catalog from '../../catalog/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import type { Connection } from '../domain/connection.js';
import { MalformedRecordError, SharedOnlyError } from '../domain/errors.js';
import { FetchLeases } from '../domain/fetch-leases.js';
import { SyncStateRepository } from '../domain/sync-state.js';
import {
  AccountPass,
  SharedPass,
  sharedRun,
  type CoursePass,
  type PassPorts,
  type Run,
} from './course-pass.js';
import {
  toFileInput,
  toItemInput,
  toPortalCourseInput,
  toRef,
  toState,
} from './records.js';

// the portal and site a connection's records are of
const siteOf = ({ portal, instance }: Connection) => ({ portal, instance });

// What a connector does, whichever way it talks to the hub: what it sends
// (records, ids, state) is checked here and handed to catalog and storage.
// A user's own account sends what it sees by passes alone; the shared
// account by passes or record by record. Errors are domain errors; the
// adapters (the sdk's PortalIngest, gRPC) answer them their own way.
@Injectable()
export class IngestService {
  private readonly ports: PassPorts;

  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
    private readonly states: SyncStateRepository,
    private readonly outbox: Outbox,
    leases: FetchLeases,
  ) {
    this.ports = {
      commands,
      queries,
      blobs,
      leases,
      notify: () => this.outbox.notify(),
    };
  }

  // The account's courses, after a listing of them that went through: a
  // user's account sees these alone from now on, the shared account keeps
  // every course it ever sent. A record refused is left out, and named; a
  // user's account keeps what it saw of that course.
  async courses(connection: Connection, raws: unknown, run: Run = sharedRun) {
    if (!Array.isArray(raws))
      throw new MalformedRecordError(['courses: a list']);
    const courses: catalog.PortalCourseInput[] = [];
    const refused: { externalId: string; issues: string[] }[] = [];
    for (const raw of raws as unknown[])
      try {
        courses.push(toPortalCourseInput(connection, raw));
      } catch (error) {
        if (!(error instanceof MalformedRecordError)) throw error;
        const { externalId } = (raw ?? {}) as { externalId?: unknown };
        refused.push({ externalId: String(externalId), issues: error.issues });
      }
    if (connection.shared)
      for (const course of courses)
        await this.commands.execute(
          new catalog.UpsertPortalCourseCommand(course),
        );
    else
      await this.commands.execute(
        new catalog.ViewCoursesCommand(
          connection.account,
          siteOf(connection),
          courses,
          refused.map(({ externalId }) => externalId),
          run.shown(new Date()),
        ),
      );
    return { refused };
  }

  // one account's view of one course, sent as a whole (CoursePass)
  pass(connection: Connection, course: unknown, run: Run = sharedRun) {
    const { externalId } = toRef(connection, course);
    const pass: CoursePass = connection.shared
      ? new SharedPass(connection, externalId, this.ports)
      : new AccountPass(connection, externalId, this.ports, run);
    return pass;
  }

  async course(connection: Connection, raw: unknown) {
    this.sharedOnly(connection);
    const { changed } = await this.commands.execute(
      new catalog.UpsertPortalCourseCommand(
        toPortalCourseInput(connection, raw),
      ),
    );
    return { changed };
  }

  async item(connection: Connection, raw: unknown) {
    this.sharedOnly(connection);
    const { changed } = await this.commands.execute(
      new catalog.UpsertItemCommand(toItemInput(connection, raw)),
    );
    return this.notify({ changed });
  }

  async file(connection: Connection, raw: unknown) {
    this.sharedOnly(connection);
    const file = toFileInput(connection, raw);
    const { changed, needsContent } = await this.commands.execute(
      new catalog.UpsertFileCommand(file),
    );
    // storage would refuse it, and the connector would send it again on
    // every sync
    const tooLarge = (file.size ?? 0) > this.blobs.maxBytes;
    return this.notify({ changed, needsContent: needsContent && !tooLarge });
  }

  async content(connection: Connection, id: string, content: Readable) {
    // checked first, so content of an unknown file isn't stored for nothing
    const file = await this.knownFile(connection, id).catch((error) => {
      content.destroy();
      throw error;
    });
    const { hash } = await this.blobs.put(content);
    const { changed } = await this.commands.execute(
      new catalog.SetFileContentCommand(file, hash),
    );
    return this.notify({ hash, changed });
  }

  async removeItem(connection: Connection, id: unknown) {
    const item = this.removable(connection, id);
    return this.notify(
      await this.commands.execute(new catalog.RemoveItemCommand(item)),
    );
  }

  async removeFile(connection: Connection, id: unknown) {
    const file = this.removable(connection, id);
    return this.notify(
      await this.commands.execute(new catalog.RemoveFileCommand(file)),
    );
  }

  state(connection: Connection) {
    return this.states.get(connection);
  }

  async saveState(connection: Connection, raw: unknown) {
    await this.states.save(connection, toState(raw));
  }

  // the connection's gone: what it saved
  forget(connection: Connection) {
    return this.states.remove(connection);
  }

  private async knownFile(connection: Connection, id: string) {
    this.sharedOnly(connection);
    const file = toRef(connection, id);
    if (!(await this.queries.execute(new catalog.FindFileQuery(file))))
      throw new catalog.UnknownReferenceError(file.portal, file.externalId);
    return file;
  }

  private removable(connection: Connection, id: unknown) {
    this.sharedOnly(connection);
    return toRef(connection, id);
  }

  private sharedOnly(connection: Connection) {
    if (!connection.shared) throw new SharedOnlyError(connection);
  }

  // a change committed a message; wake the relay instead of waiting for its poll
  private notify<T extends { changed: boolean }>(result: T) {
    if (result.changed) this.outbox.notify();
    return result;
  }
}
