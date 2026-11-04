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
import {
  announcementRecord,
  assignmentRecord,
  moduleRecord,
  pageRecord,
} from './records.js';
import { forEveryone } from './visibility.js';

export interface CourseContent {
  // in the order they go to the hub: a file's announcement before it
  items: ItemRecord[];
  files: FoundFile[];
  // the sources that went through to the end, with what they had
  listings: Listings;
}

// what the modules link to of one type, each once
const linked = <K extends 'page_url' | 'content_id'>(
  items: ModuleItem[],
  type: string,
  key: K,
) =>
  new Set(
    items
      .filter((item) => item.type === type)
      .map((item) => item[key] as NonNullable<ModuleItem[K]>),
  );

// One course as the token's user sees it. A hidden tab only keeps the
// pages or the files from being listed (canvas-lms checks it there and
// nowhere else), so the pages and files the modules link to are read one
// by one either way.
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
      this.item(moduleRecord(this.base, this.id, module)),
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
    for (const topic of topics.filter(forEveryone.announcement)) {
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
    const linkedIds: string[] = [];
    for (const name of linked(fromModules, 'Page', 'page_url')) {
      const id = ids.get(name) ?? (await this.page(name));
      // one refused: the modules' pages aren't all there this run
      if (!id) return;
      linkedIds.push(id);
    }
    this.listings.items['module-pages'] = linkedIds;
  }

  private async page(name: string) {
    const page = await visible(
      this.api.get<Page>(`${this.path}/pages/${encodeURIComponent(name)}`),
    );
    return page && this.item(pageRecord(this.id, page));
  }

  // with the dates for everyone, not the token user's own
  private async assignments() {
    const all = await visible(
      this.api.list<Assignment>(
        `${this.path}/assignments?override_assignment_dates=false`,
      ),
    );
    if (!all) return;
    this.listings.items.assignments = all
      .filter(forEveryone.assignment)
      .map((assignment) => this.item(assignmentRecord(this.id, assignment)));
  }

  private async courseFiles(tab: boolean, fromModules: ModuleItem[] | null) {
    if (tab) await this.fileListing();
    if (!fromModules) return;
    const linkedIds: string[] = [];
    for (const id of linked(fromModules, 'File', 'content_id')) {
      const file =
        this.files.get(id) ??
        (await visible(this.api.get<CanvasFile>(`${this.path}/files/${id}`)));
      if (!file) return;
      linkedIds.push(this.files.add(file));
    }
    this.listings.files['module-files'] = linkedIds;
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
      this.listings.files.files = files.map((file) => this.files.add(file));
  }

  private item(record: ItemRecord) {
    this.items.push(record);
    return record.externalId;
  }
}
