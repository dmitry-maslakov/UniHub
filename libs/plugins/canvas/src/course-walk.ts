import type { ItemRecord } from '@app/plugin-sdk';
import type { CanvasApi } from './canvas-api.js';
import type {
  Assignment,
  CanvasFile,
  Folder,
  Module,
  ModuleItem,
  Page,
  Tab,
  Topic,
} from './canvas.types.js';
import { CourseFiles, type FoundFile } from './course-files.js';
import { visible } from './errors.js';
import type { Listings } from './listings.js';
import { linked, readEach } from './module-links.js';
import {
  announcementRecord,
  assignmentRecord,
  moduleRecord,
  pageRecord,
} from './records.js';
import { forEveryone, ownModule } from './visibility.js';

// Whose view a walk reads: the whole course's, the shared account's, which
// leaves out what only some of it see; or a user's own account's, as it
// sees the course
export type View = 'whole' | 'own';

export interface CourseContent {
  // in the order they go to the hub: a file's announcement before it
  items: ItemRecord[];
  files: FoundFile[];
  // the sources that went through to the end, with what they had
  listings: Listings;
}

// One course as the token's user sees it, or what of it the whole course
// sees (View). A hidden tab only keeps the pages or the files from being
// listed (canvas-lms checks it there and nowhere else), so the pages and
// files the modules link to are read one by one either way.
export class CourseWalk {
  private readonly items: ItemRecord[] = [];
  private readonly files = new CourseFiles();
  private readonly listings: Listings = { items: {}, files: {} };
  private readonly id: string;
  private readonly path: string;

  constructor(
    private readonly api: CanvasApi,
    private readonly base: string,
    course: number,
    private readonly view: View = 'whole',
  ) {
    this.id = String(course);
    this.path = `/api/v1/courses/${course}`;
  }

  async read(): Promise<CourseContent> {
    const tabs = await this.tabs();
    const fromModules = await this.modules();
    await this.announcements();
    await this.pages(tabs.has('pages'), fromModules);
    await this.assignments();
    await this.courseFiles(tabs.has('files'), fromModules);
    const files = this.files.records(this.base, this.id);
    return { items: this.items, files, listings: this.listings };
  }

  private async tabs() {
    const tabs = await visible(this.api.list<Tab>(`${this.path}/tabs`));
    return new Set(tabs?.filter((tab) => !tab.hidden).map((tab) => tab.id));
  }

  // what the modules link to, null when they couldn't be read
  private async modules() {
    const modules = await visible(this.moduleList());
    if (!modules) return null;
    this.listings.items.modules = modules.map((module) =>
      this.item(
        moduleRecord(
          this.base,
          this.id,
          this.view === 'whole' ? module : ownModule(module),
        ),
      ),
    );
    return modules.flatMap((module) => module.items ?? []);
  }

  // Without their items' content_details: Canvas gives an item's dates
  // there as they are for the token's user.
  private async moduleList() {
    const modules = await this.api.list<Module>(
      `${this.path}/modules?include[]=items`,
    );
    for (const module of modules)
      module.items ??= await this.api.list<ModuleItem>(
        `${this.path}/modules/${module.id}/items`,
      );
    return modules;
  }

  // Not /announcements, which gives only the last 14 days. An attachment's
  // file names its announcement.
  private async announcements() {
    const topics = await visible(
      this.api.list<Topic>(
        `${this.path}/discussion_topics?only_announcements=true`,
      ),
    );
    if (!topics) return;
    const items: string[] = [];
    const files: string[] = [];
    for (const topic of topics.filter(this.seen(forEveryone.announcement))) {
      const id = this.item(announcementRecord(this.id, topic));
      items.push(id);
      for (const file of topic.attachments ?? [])
        files.push(this.files.add(file, id));
    }
    this.listings.items.announcements = items;
    this.listings.files.attachments = files;
  }

  private async pages(tab: boolean, fromModules: ModuleItem[] | null) {
    const listed = tab
      ? await visible(this.api.list<Page>(`${this.path}/pages?include[]=body`))
      : null;
    // by url name, the one modules link by
    const ids = new Map(
      listed?.map((page) => [page.url, this.item(pageRecord(this.id, page))]),
    );
    if (listed) this.listings.items.pages = [...ids.values()];
    if (!fromModules) return;
    const linkedIds = await readEach(
      linked(fromModules, 'Page', 'page_url'),
      async (name) => ids.get(name) ?? (await this.page(name)),
    );
    if (linkedIds) this.listings.items['module-pages'] = linkedIds;
  }

  private async page(name: string) {
    const page = await visible(
      this.api.get<Page>(`${this.path}/pages/${encodeURIComponent(name)}`),
    );
    return page && this.item(pageRecord(this.id, page));
  }

  // the whole course's with the dates for everyone, not the token user's
  // own; a user's own with theirs
  private async assignments() {
    const dates =
      this.view === 'whole' ? '?override_assignment_dates=false' : '';
    const all = await visible(
      this.api.list<Assignment>(`${this.path}/assignments${dates}`),
    );
    if (!all) return;
    this.listings.items.assignments = all
      .filter(this.seen(forEveryone.assignment))
      .map((assignment) => this.item(assignmentRecord(this.id, assignment)));
  }

  // what the view has: the whole course's only what everyone sees
  private seen<T>(byEveryone: (object: T) => boolean) {
    return (object: T) => this.view === 'own' || byEveryone(object);
  }

  private async courseFiles(tab: boolean, fromModules: ModuleItem[] | null) {
    if (tab) await this.fileListing();
    if (!fromModules) return;
    const linkedIds = await readEach(
      linked(fromModules, 'File', 'content_id'),
      async (id) => {
        const file =
          this.files.get(id) ??
          (await visible(this.api.get<CanvasFile>(`${this.path}/files/${id}`)));
        return file && this.files.add(file);
      },
    );
    if (linkedIds) this.listings.files['module-files'] = linkedIds;
  }

  // the folders give the files their paths
  private async fileListing() {
    const folders = await visible(
      this.api.list<Folder>(`${this.path}/folders`),
    );
    for (const folder of folders ?? []) this.files.folder(folder);
    const files = await visible(
      this.api.list<CanvasFile>(`${this.path}/files`),
    );
    if (files)
      this.listings.files.files = files
        .filter((file) => this.files.sent(file))
        .map((file) => this.files.add(file));
  }

  private item(record: ItemRecord) {
    this.items.push(record);
    return record.externalId;
  }
}
