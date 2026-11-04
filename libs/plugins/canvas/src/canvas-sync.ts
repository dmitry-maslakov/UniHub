import { Logger } from '@nestjs/common';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type PortalIngest,
} from '@app/plugin-sdk';
import type { CanvasApi } from './canvas-api.js';
import type { Course } from './canvas.types.js';
import type { FoundFile } from './course-files.js';
import { CourseWalk, type CourseContent } from './course-walk.js';
import { skippable } from './errors.js';
import { settle, SyncState, type Listings } from './listings.js';
import { courseRecord } from './records.js';

// One run: every open course the token's user is in. Its records go to the
// hub, then what is gone from it is removed and its listings saved, so a
// run cut short goes on from the courses it got through. A course no
// longer listed keeps its records, and its listings for when it's back. A
// course Canvas fails on, or whose record the hub refuses, keeps them too:
// the others go on, and the run fails once they're through.
export class CanvasSync {
  private readonly logger = new Logger(CanvasSync.name);

  constructor(
    private readonly api: CanvasApi,
    private readonly ingest: PortalIngest,
    // the school's Canvas, for links into it
    private readonly base: string,
  ) {}

  async run() {
    const state = SyncState.parse(await this.ingest.state());
    const courses = await this.api.list<Course>(
      '/api/v1/courses?enrollment_state=active&include[]=term',
    );
    const skipped: number[] = [];
    for (const course of courses) {
      // not open to its students yet: only its id comes
      if (course.access_restricted_by_date) continue;
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
    await this.ingest.course(courseRecord(this.base, course));
    const walk = new CourseWalk(this.api, this.base, course.id);
    const last = state.courses[course.id];
    state.courses[course.id] = await this.write(await walk.read(), last);
    await this.ingest.saveState(state);
  }

  // the course's records, then what is gone from it; the listings to keep
  private async write(content: CourseContent, last?: Listings) {
    for (const item of content.items)
      await this.skipRefused(`item ${item.externalId}`, () =>
        this.ingest.item(item),
      );
    for (const file of content.files)
      await this.skipRefused(`file ${file.record.externalId}`, () =>
        this.file(file),
      );
    const { listings, gone } = settle(last, content.listings);
    for (const id of gone.items) await this.ingest.removeItem(id);
    for (const id of gone.files) await this.ingest.removeFile(id);
    return listings;
  }

  // what the file is, every run; its content only when the hub asks
  private async file({ record, download }: FoundFile) {
    const { needsContent } = await this.ingest.file(record);
    // locked for the token's user for now: the next run tries again
    if (!needsContent || !download) return;
    await this.ingest.content(
      record.externalId,
      await this.api.download(download),
    );
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
