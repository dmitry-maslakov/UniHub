import { Logger } from '@nestjs/common';
import {
  InvalidRecordError,
  OutOfBudgetError,
  readPage,
  RequestFailedError,
  UnreadablePageError,
  type CoursePass,
  type FileRecord,
  type Head,
  type Json,
  type PortalIngest,
  type SiteClient,
  type SitePage,
  type SiteRobots,
} from '@app/plugin-sdk';
import { stateOf, type CourseState, type State } from './pmwiki.state.js';
import {
  canonicalOf,
  changesIn,
  changesOf,
  CONTENT,
  courseLinks,
  courseName,
  documentsIn,
  indexIn,
  isHome,
  isUpload,
  pageName,
  pagesOf,
  timeOf,
  titleOf,
  wikiOf,
  type Document,
} from './pmwiki.wiki.js';

const PAGE_LIMIT = 8 * 1024 * 1024;
const DAY_MS = 86_400_000;

// the site asks us to stop (429, 503): the run ends, its state saved, and
// the next one goes on
class StopRunError extends Error {}
// what one page's trouble is, not the run's
class PageFailedError extends Error {}

const ok = (status: number) => status >= 200 && status < 300;
const where = (url: URL) => url.pathname + url.search;

// a course's id: its page's address, but its scheme
const idOf = (page: string) => {
  const url = new URL(page);
  return url.host + url.pathname + url.search;
};

export interface SyncOptions {
  wikis: readonly string[];
  revisitDays: number;
  // per run and site, as each client counts it
  maxRequests: number;
  ingest: PortalIngest;
  // the run's client of a site, one per origin
  client(origin: string): SiteClient;
  signal: AbortSignal;
}

interface Course {
  // its page's own address
  url: string;
  id: string;
  name: string;
  // the listed wiki its page is of
  wiki: string;
}

interface Found {
  record: FileRecord;
  url: URL;
  // in the wiki's uploads: a file as it was uploaded, its type whatever
  upload: boolean;
}

interface Passed {
  course: Course;
  pass: CoursePass;
  fetch: Found[];
}

// One run over the listed wikis (README, PmWiki): their catalog of courses,
// then a pass of each course that's due, then the files the hub asked for.
export class Sync {
  private readonly logger = new Logger('PmwikiConnector');
  private state: State = stateOf(null);
  private readonly today = Math.floor(Date.now() / DAY_MS);
  private readonly hosts: ReadonlySet<string>;
  private readonly robots = new Map<string, Promise<SiteRobots>>();
  // each page's last change, as its wiki's recent changes say this run
  private readonly changes = new Map<string, string>();
  // course pages read this run as their links were looked into
  private readonly pages = new Map<string, SitePage>();
  private read = 0;
  private stored = 0;
  private left = 0;

  constructor(private readonly o: SyncOptions) {
    this.hosts = new Set(o.wikis.map((wiki) => new URL(wiki).host));
  }

  async run() {
    this.state = stateOf(await this.o.ingest.state());
    try {
      await this.sync(await this.catalog());
    } catch (error) {
      if (error instanceof OutOfBudgetError)
        this.logger.warn('out of requests: the next run goes on');
      else if (error instanceof StopRunError)
        this.logger.warn(`${error.message}: the next run goes on`);
      else throw error;
    } finally {
      // a run the hub let go of can't save: it has been told already
      await this.save().catch((error: unknown) => {
        if (!this.o.signal.aborted) throw error;
      });
      this.logger.log(
        `read ${this.read} courses, stored ${this.stored} files, ${this.left} left due`,
      );
    }
  }

  // Every wiki's courses, sent as the catalog: a wiki that fails this run
  // lists what it did before. A course is named by the wiki its page is of,
  // when that one lists it, else by the first that does.
  private async catalog() {
    for (const wiki of this.o.wikis)
      try {
        await this.wiki(wiki);
      } catch (error) {
        if (!(error instanceof PageFailedError)) throw error;
        this.logger.warn(`${wiki}: ${error.message}`);
      }
    const named = new Map<string, Course>();
    for (const own of [true, false])
      for (const lister of this.o.wikis)
        for (const [url, name] of Object.entries(
          this.state.wikis[lister]?.courses ?? {},
        )) {
          const wiki = wikiOf(url, this.o.wikis);
          if (!wiki || named.has(url) || (wiki === lister) !== own) continue;
          const title = this.state.wikis[wiki]?.title ?? '';
          named.set(url, {
            url,
            id: idOf(url),
            name: courseName(name, title),
            wiki,
          });
        }
    const courses = [...named.values()];
    const { refused } = await this.o.ingest.courses(
      courses.map(({ id, name, url }) => ({ externalId: id, name, url })),
    );
    const skipped = new Set(
      refused.map(({ externalId, error }) => {
        this.logger.warn(`course ${externalId} skipped: ${error.message}`);
        return externalId;
      }),
    );
    return courses.filter((course) => !skipped.has(course.id));
  }

  // A wiki's recent changes, then its index, read again when it changed or
  // is due, and the courses it links.
  private async wiki(wiki: string) {
    const ws = (this.state.wikis[wiki] ??= {
      title: '',
      m: null,
      d: 0,
      links: {},
      courses: {},
    });
    const changes = await this.page(changesOf(wiki));
    if (!changes) throw new PageFailedError('its recent changes are no page');
    for (const [page, change] of changesIn(changes, this.hosts))
      this.changes.set(page, change);
    ws.title = titleOf(changes);

    if (ws.index === undefined || (ws.index === null && this.revisit(ws.d))) {
      const list = await this.page(pagesOf(wiki));
      ws.index = list && indexIn(list, this.hosts);
      if (!ws.index) {
        this.logger.warn(`${wiki}: no Teaching page, nor a Courses group`);
        Object.assign(ws, { index: null, d: this.today, courses: {} });
        return;
      }
    }
    if (!ws.index) return;
    const change = this.changes.get(ws.index) ?? null;
    const retry = ws.a !== undefined && ws.a !== this.today;
    if (ws.d && change === ws.m && !this.revisit(ws.d) && !retry) return;

    const at = ws.index;
    let index;
    try {
      index = await this.page(new URL(at));
    } finally {
      // looked for again next run, should it have moved
      if (!index) ws.index = undefined;
    }
    if (!index) throw new PageFailedError(`${at}: no wiki page`);
    const own = canonicalOf(index, this.hosts) ?? at;
    const links: Record<string, string | null> = {};
    const courses: Record<string, string> = {};
    let untold = false;
    for (const { url, name } of courseLinks(index, this.o.wikis, this.hosts)) {
      const course = url in ws.links ? ws.links[url] : await this.courseAt(url);
      if (course === undefined) {
        untold = true;
        continue;
      }
      links[url] = course;
      if (
        course &&
        course !== own &&
        !isHome(course, wikiOf(course, this.o.wikis)!)
      )
        courses[course] ??= name;
    }
    // an index that holds documents of its own is a course of them
    if (documentsIn(index, wiki, this.hosts).length) {
      courses[own] ??= pageName(own);
      this.pages.set(own, index);
    }
    Object.assign(ws, { m: change, d: this.today, links, courses });
    if (untold) ws.a = this.today;
    else delete ws.a;
  }

  // The course page a link is: its own address, when it's a page of one of
  // the wikis; null when it's none; undefined when it can't be told now.
  private async courseAt(url: string) {
    // read already this run, by another index's link
    if (this.pages.has(url)) return url;
    let page;
    try {
      page = await this.page(new URL(url));
    } catch (error) {
      if (!(error instanceof PageFailedError)) throw error;
      this.logger.warn(error.message);
      return undefined;
    }
    const own = page && canonicalOf(page, this.hosts);
    if (!page || !own || !wikiOf(own, this.o.wikis)) return null;
    this.pages.set(own, page);
    return own;
  }

  // a wiki's page, null when it's no wiki's (it has no #wikitext)
  private async page(url: URL) {
    if (!(await this.robotsOf(url.origin)).allowed(url))
      throw new PageFailedError(`${where(url)}: robots.txt disallows it`);
    let answer;
    try {
      answer = await this.o.client(url.origin).text(url, PAGE_LIMIT);
    } catch (error) {
      if (error instanceof RequestFailedError)
        throw new PageFailedError(error.message);
      throw error;
    }
    this.stopOn(answer.status);
    if (!ok(answer.status))
      throw new PageFailedError(
        `${where(url)}: the site answered ${answer.status}`,
      );
    try {
      return await readPage(answer.body, answer.url, { content: CONTENT });
    } catch (error) {
      if (error instanceof UnreadablePageError)
        throw new PageFailedError(error.message);
      throw error;
    }
  }

  private robotsOf(origin: string) {
    let robots = this.robots.get(origin);
    if (!robots) {
      robots = this.o.client(origin).robots();
      this.robots.set(origin, robots);
    }
    return robots;
  }

  private stopOn(status: number) {
    if (status === 429 || status === 503)
      throw new StopRunError(`the site answered ${status}`);
  }

  private revisit(day: number) {
    return this.today - day >= this.o.revisitDays;
  }

  // never read, failed on another day, changed, or due again
  private isDue(course: Course) {
    const cs = this.state.courses[course.id];
    if (cs?.a === this.today) return false;
    if (!cs?.d || cs.a !== undefined) return true;
    const change = this.changes.get(course.url);
    return (change !== undefined && change !== cs.m) || this.revisit(cs.d);
  }

  // The courses due, those never read first, then those read longest ago,
  // each with as many of its files as fit in the site's requests left
  // besides the downloads already to come: a file the hub has costs its
  // HEAD, one it hasn't its download too. A course passed with some of its
  // files has the others next run, those the hub hasn't first. Then the
  // downloads.
  private async sync(courses: Course[]) {
    const due = courses
      .filter((course) => this.isDue(course))
      .map((course) => ({ course, cs: this.state.courses[course.id] }))
      .sort(
        (a, b) =>
          (a.cs?.d ?? 0) - (b.cs?.d ?? 0) ||
          Number(a.cs?.a !== undefined) - Number(b.cs?.a !== undefined),
      )
      .map(({ course }) => course);
    this.left = due.length;
    const passed: Passed[] = [];
    // per site, the downloads the passes so far may bring
    const downloads = new Map<string, number>();
    for (const course of due) {
      const url = new URL(course.url);
      const client = this.o.client(url.origin);
      if (client.requests >= this.o.maxRequests) break;
      let page;
      try {
        page = this.pages.get(course.url) ?? (await this.page(url));
      } catch (error) {
        if (!(error instanceof PageFailedError)) throw error;
        this.failed(course, error.message);
        continue;
      }
      if (!page) {
        this.failed(course, `${where(url)}: no wiki page`);
        continue;
      }
      const robots = await this.robotsOf(url.origin);
      const held = new Set(this.state.courses[course.id]?.f ?? []);
      const linked = documentsIn(page, course.wiki, this.hosts)
        .filter((doc) => robots.allowed(new URL(doc.url)))
        .map((doc) => ({ doc, id: `${course.id}|${doc.path}` }));
      let left =
        this.o.maxRequests - client.requests - (downloads.get(url.origin) ?? 0);
      const asked = new Set<string>();
      for (const { id } of [
        ...linked.filter(({ id }) => !held.has(id)),
        ...linked.filter(({ id }) => held.has(id)),
      ]) {
        const cost = held.has(id) ? 1 : 2;
        if (cost > left) break;
        asked.add(id);
        left -= cost;
      }
      if (asked.size < linked.length)
        this.logger.warn(
          `${where(url)}: ${linked.length - asked.size} of its ${linked.length} files wait for the next run's requests`,
        );
      const sent = await this.pass(course, page, linked, asked);
      passed.push(sent);
      downloads.set(
        url.origin,
        (downloads.get(url.origin) ?? 0) + sent.fetch.length,
      );
      this.read++;
      if (asked.size === linked.length) this.left--;
    }
    await this.download(passed);
  }

  // The course's page and the files asked of its links, as one pass. A
  // file not asked this run, or one the site fails to say anything of,
  // stays as it was; one its page no longer links, or the site answers 404
  // or 410 to, is gone. A course passed with only some of its files is due
  // again.
  private async pass(
    course: Course,
    page: SitePage,
    linked: { doc: Document; id: string }[],
    asked: ReadonlySet<string>,
  ) {
    const before = this.state.courses[course.id];
    const held = new Set(before?.f ?? []);
    const found: Found[] = [];
    // still in its view, as they were
    const kept = linked
      .filter(({ id }) => !asked.has(id) && held.has(id))
      .map(({ id }) => id);
    for (const { doc, id } of linked) {
      if (!asked.has(id)) continue;
      const head = await this.headOf(doc);
      if (head === 'gone') continue;
      if (head === null) {
        if (held.has(id)) kept.push(id);
        continue;
      }
      const mime = head.type.split(';')[0].trim();
      found.push({
        url: new URL(doc.url),
        upload: isUpload(doc.path, course.wiki),
        record: {
          externalId: id,
          course: course.id,
          item: course.id,
          name: doc.name,
          url: doc.url,
          ...(head.size !== null && { size: head.size }),
          ...(mime && { mime }),
          ...(head.modified && { updatedAt: head.modified }),
        },
      });
    }

    const pass = await this.o.ingest.pass(course.id);
    const change = this.changes.get(course.url) ?? null;
    const at = change ? timeOf(change) : null;
    await this.skipRefused(`course ${course.id}`, () =>
      pass.item({
        externalId: course.id,
        course: course.id,
        kind: 'page',
        title: course.name,
        url: course.url,
        ...(at && { publishedAt: at }),
        raw: { body: page.body },
      }),
    );
    const fetch: Found[] = [];
    const now = [...kept];
    for (const file of found)
      await this.skipRefused(`file ${file.record.externalId}`, async () => {
        if ((await pass.file(file.record)).fetch) fetch.push(file);
        now.push(file.record.externalId);
      });

    const gone = [...held].filter((id) => !now.includes(id));
    // till the end goes through, its view holds what's gone too: an end
    // that fails leaves that for the next run to name
    this.state.courses[course.id] = this.ended(before, {
      f: [...new Set([...held, ...now])],
    });
    await this.save();
    await pass.end({ files: gone });
    const whole = linked.every(({ id }) => asked.has(id));
    this.state.courses[course.id] = {
      m: change,
      d: whole ? this.today : 0,
      f: now,
    };
    await this.save();
    return { course, pass, fetch };
  }

  private ended(
    before: CourseState | undefined,
    { f }: Pick<CourseState, 'f'>,
  ): CourseState {
    return { m: before?.m ?? null, d: before?.d ?? 0, f };
  }

  // What the site says of a file: null when it says nothing (a failure, an
  // answer of another page), 'gone' for a 404 or a 410.
  private async headOf(doc: Document): Promise<Head | 'gone' | null> {
    const url = new URL(doc.url);
    try {
      const head = await this.o.client(url.origin).head(url);
      this.stopOn(head.status);
      if (head.status === 404 || head.status === 410) return 'gone';
      if (!ok(head.status)) {
        this.logger.warn(`${doc.path}: the site answered ${head.status}`);
        return null;
      }
      if (head.url.pathname !== url.pathname) {
        this.logger.warn(`${doc.path}: answered as ${head.url.pathname}`);
        return null;
      }
      return head;
    } catch (error) {
      if (!(error instanceof RequestFailedError)) throw error;
      this.logger.warn(error.message);
      return null;
    }
  }

  // Once every pass has ended, the files the hub asked for. A course whose
  // downloads the run doesn't get through is read again next run, when the
  // hub asks for what it still lacks.
  private async download(passed: Passed[]) {
    const unfinished = new Set(
      passed.filter((p) => p.fetch.length).map((p) => p.course.id),
    );
    try {
      for (const { course, pass, fetch } of passed) {
        for (const file of fetch) await this.fetch(pass, file);
        unfinished.delete(course.id);
      }
    } finally {
      for (const id of unfinished) this.state.courses[id].d = 0;
    }
  }

  // A file that can't be had is a warning; the others go on.
  private async fetch(pass: CoursePass, { record, url, upload }: Found) {
    try {
      const answer = await this.o.client(url.origin).stream(url);
      const { status, body, type } = answer;
      try {
        this.stopOn(status);
        if (!ok(status))
          return this.logger.warn(
            `${url.pathname}: the site answered ${status}`,
          );
        // a page in a file's place: a login, an error, another page
        if (
          answer.url.pathname !== url.pathname ||
          (type.includes('text/html') && !upload)
        )
          return this.logger.warn(
            `${url.pathname}: answered with another page`,
          );
        await pass.content(record.externalId, body);
        this.stored++;
      } finally {
        body.destroy();
      }
    } catch (error) {
      this.o.signal.throwIfAborted();
      if (error instanceof RequestFailedError)
        return this.logger.warn(error.message);
      if (
        error instanceof InvalidRecordError &&
        error.reason === 'CONTENT_TOO_LARGE'
      )
        return this.logger.warn(`${url.pathname}: too large to keep`);
      throw error;
    }
  }

  // the course stays as it was, and is tried again another day
  private failed(course: Course, message: string) {
    this.logger.warn(message);
    const cs = this.state.courses[course.id] ?? { m: null, d: 0, f: [] };
    this.state.courses[course.id] = { ...cs, a: this.today };
  }

  // a record the hub refuses is that one's problem: logged and skipped
  private async skipRefused(what: string, send: () => Promise<unknown>) {
    try {
      await send();
    } catch (error) {
      if (!(error instanceof InvalidRecordError)) throw error;
      this.logger.warn(`${what} skipped: ${error.message}`);
    }
  }

  private async save() {
    await this.o.ingest.saveState(this.state as unknown as Json);
  }
}
