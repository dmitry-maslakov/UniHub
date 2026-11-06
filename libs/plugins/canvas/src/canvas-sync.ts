import { Logger } from '@nestjs/common';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type CoursePass,
  type PortalIngest,
} from '@app/plugin-sdk';
import type { CanvasApi } from './canvas-api.js';
import type { Course } from './canvas.types.js';
import type { FoundFile } from './course-files.js';
import { CourseWalk, type CourseContent, type View } from './course-walk.js';
import { skippable } from './errors.js';
import { settle, SyncState } from './listings.js';
import { courseRecord } from './records.js';

// One run: every open course the token's user is in, sent as the hub's
// courses, then each one's records in a pass of its own, its listings
// saved and the pass ended with what's gone from a listing that went
// through (only what one had before and no longer has: a listing that
// failed, or one never saved, takes nothing away); then the files the hub
// asked for are downloaded. The listings are saved before the end, so the
// hub never has what they don't. A run cut short goes on from the courses
// it got through. A course no longer listed is gone from a user's
// account's view, and keeps its records for the shared account, its
// listings kept for when it's back. A course Canvas fails on, or whose
// record the hub refuses, keeps what its view had: the others go on, and
// the run fails once they're through.
export class CanvasSync {
  private readonly logger = new Logger(CanvasSync.name);

  constructor(
    private readonly api: CanvasApi,
    private readonly ingest: PortalIngest,
    // the school's Canvas, for links into it
    private readonly base: string,
    private readonly view: View = 'whole',
  ) {}

  async run() {
    const state = SyncState.parse(await this.ingest.state());
    const listed = await this.api.list<Course>(
      '/api/v1/courses?enrollment_state=active&include[]=term',
    );
    // not open to its students yet: only its id comes
    const open = listed.filter((c) => !c.access_restricted_by_date);
    const { refused } = await this.ingest.courses(
      open.map((c) => courseRecord(this.base, c)),
    );
    const skipped = refused.map(({ externalId, error }) => {
      this.logger.warn(`course ${externalId} skipped: ${error.message}`);
      return Number(externalId);
    });
    const courses = open.filter((c) => !skipped.includes(c.id));
    for (const course of courses) {
      const synced = await this.skipRefused(`course ${course.id}`, () =>
        this.sync(course, state),
      );
      if (!synced) skipped.push(course.id);
    }
    if (skipped.length)
      throw new Error(
        `canvas courses ${skipped.join(', ')} skipped this run, see the warnings`,
      );
  }

  private async sync(course: Course, state: SyncState) {
    const walk = new CourseWalk(this.api, this.base, course.id, this.view);
    const content = await walk.read();
    const pass = await this.ingest.pass(String(course.id));
    const { listings, gone } = settle(
      state.courses[course.id],
      content.listings,
    );
    const fetch = await this.send(pass, content);
    state.courses[course.id] = listings;
    await this.ingest.saveState(state);
    await pass.end(gone);
    for (const { record, download } of fetch)
      await this.skipRefused(`file ${record.externalId}`, async () =>
        pass.content(record.externalId, await this.api.download(download)),
      );
  }

  // the course's records; the files whose content the hub asks for
  private async send(pass: CoursePass, content: CourseContent) {
    for (const item of content.items)
      await this.skipRefused(`item ${item.externalId}`, () => pass.item(item));
    const fetch: FoundFile[] = [];
    for (const file of content.files)
      await this.skipRefused(`file ${file.record.externalId}`, async () => {
        // locked for the token's user for now: a later run tries again
        const seen = { locked: !file.download };
        if ((await pass.file(file.record, seen)).fetch) fetch.push(file);
      });
    return fetch;
  }

  // A record the hub refuses, or a request Canvas refuses or fails (a
  // download, a course's listing), is that one's problem: logged and
  // skipped, the rest of the run goes on.
  private async skipRefused(what: string, send: () => Promise<unknown>) {
    try {
      await send();
      return true;
    } catch (error) {
      const refused =
        error instanceof InvalidRecordError ||
        error instanceof UnknownReferenceError ||
        skippable(error);
      if (!refused) throw error;
      this.logger.warn(`${what} skipped: ${error.message}`);
      return false;
    }
  }
}
