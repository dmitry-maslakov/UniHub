import { Logger } from '@nestjs/common';
import {
  InvalidRecordError,
  OutOfBudgetError,
  readPage,
  RequestFailedError,
  RobotsUnreadableError,
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
import { stateOf, type State } from './pmwiki.state.js';
import {
  changesIn,
  changesOf,
  CONTENT,
  courseLinks,
  courseName,
  documentsIn,
  indexIn,
  isHome,
  ownAddress,
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

// What one page's trouble is, not the run's. Lasting: the site says it
// isn't there, or isn't to be read (404, 410, robots.txt), which another
// look soon won't change.
class PageFailedError extends Error {
  constructor(
    message: string,
    readonly lasting = false,
  ) {
    super(message);
  }
}

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

// a page as read, and where it was answered from
interface Read {
  page: SitePage;
  at: URL;
}

interface Found {
  record: FileRecord;
  url: URL;
  upload: boolean;
}

interface Passed {
  course: Course;
  pass: CoursePass;
  fetch: Found[];
  // every file it links that the hub lacks was in the pass
  whole: boolean;
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
  // per site, the requests the downloads of the passes so far may take
  private readonly reserved = new Map<string, number>();
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

  // Every wiki's courses, sent as the catalog: a wiki that fails this run,
  // or runs out of its site's requests, lists what it did before. A course
  // is named by the wiki its page is of, when that one lists it, else by
  // the first that does.
  private async catalog() {
    for (const wiki of this.o.wikis)
      try {
        await this.wiki(wiki);
      } catch (error) {
        if (
          !(error instanceof PageFailedError) &&
          !(error instanceof OutOfBudgetError)
        )
          throw error;
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

  // A wiki's recent changes, then its index, read again when it changed,
  // is due, or wasn't got through, and the courses it links. What its links
  // are is kept as each is told, so a run that stops partway goes on from
  // there; at a revisit, those that were none are looked at again.
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
    for (const [page, change] of changesIn(changes.page, this.hosts))
      this.changes.set(page, change);
    ws.title = titleOf(changes.page);

    if (ws.index === undefined || (ws.index === null && this.revisit(ws.d))) {
      const list = await this.page(pagesOf(wiki));
      ws.index = list && indexIn(list.page, this.hosts);
      if (!ws.index) {
        this.logger.warn(`${wiki}: no Teaching page, nor a Courses group`);
        Object.assign(ws, { index: null, d: this.today, courses: {} });
        return;
      }
    }
    if (!ws.index) return;
    const change = this.changes.get(ws.index) ?? null;
    const revisit = this.revisit(ws.d);
    const retry = ws.a !== undefined && ws.a !== this.today;
    if (ws.d && change === ws.m && !revisit && !retry) return;

    const at = ws.index;
    let index;
    try {
      index = await this.page(new URL(at));
    } finally {
      // looked for again next run, should it have moved
      if (!index) ws.index = undefined;
    }
    if (!index) throw new PageFailedError(`${at}: no wiki page`);
    const own = ownAddress(index.page, index.at, this.hosts) ?? at;
    const linked = new Set<string>();
    const courses: Record<string, string> = {};
    let untold = false;
    for (const { url, name } of courseLinks(
      index.page,
      this.o.wikis,
      this.hosts,
    )) {
      linked.add(url);
      if (!(url in ws.links) || (revisit && ws.links[url] === null)) {
        const told = await this.courseAt(url);
        if (told === undefined) {
          untold = true;
          continue;
        }
        ws.links[url] = told;
      }
      const course = ws.links[url];
      if (
        course &&
        course !== own &&
        !isHome(course, wikiOf(course, this.o.wikis)!)
      )
        courses[course] ??= name;
    }
    for (const url of Object.keys(ws.links))
      if (!linked.has(url)) delete ws.links[url];
    // an index that holds documents of its own is a course of them
    if (documentsIn(index.page, wiki, this.hosts).length) {
      courses[own] ??= pageName(own);
      this.pages.set(own, index.page);
    }
    Object.assign(ws, { m: change, d: this.today, courses });
    if (untold) ws.a = this.today;
    else delete ws.a;
  }

  // The course page a link is: its own address, when it's a page of one of
  // the wikis; null when it's none, or the site says it isn't there to
  // read; undefined when it can't be told now.
  private async courseAt(url: string) {
    // read already this run, by another index's link
    if (this.pages.has(url)) return url;
    let read;
    try {
      read = await this.page(new URL(url));
    } catch (error) {
      if (!(error instanceof PageFailedError)) throw error;
      this.logger.warn(error.message);
      return error.lasting ? null : undefined;
    }
    const own = read && ownAddress(read.page, read.at, this.hosts);
    if (!read || !own || !wikiOf(own, this.o.wikis)) return null;
    this.pages.set(own, read.page);
    return own;
  }

  // a wiki's page, null when it's no wiki's (it has no #wikitext)
  private async page(url: URL): Promise<Read | null> {
    if (!(await this.robotsOf(url.origin)).allowed(url))
      throw new PageFailedError(`${where(url)}: robots.txt disallows it`, true);
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
        answer.status === 404 || answer.status === 410,
      );
    let page;
    try {
      page = await readPage(answer.body, answer.url, { content: CONTENT });
    } catch (error) {
      if (error instanceof UnreadablePageError)
        throw new PageFailedError(error.message);
      throw error;
    }
    return page && { page, at: answer.url };
  }

  // A site's robots.txt, asked once a run: one it can't read leaves that
  // site's wikis as they were this run, and a 429 or 503 stops the run.
  private async robotsOf(origin: string) {
    let robots = this.robots.get(origin);
    if (!robots) {
      robots = this.o.client(origin).robots();
      this.robots.set(origin, robots);
    }
    try {
      return await robots;
    } catch (error) {
      if (!(error instanceof RobotsUnreadableError)) throw error;
      if (error.status !== null) this.stopOn(error.status);
      throw new PageFailedError(error.message);
    }
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

  // what a site's requests leave, besides the downloads already to come
  private spare(origin: string) {
    const spent = this.o.client(origin).requests;
    return this.o.maxRequests - spent - (this.reserved.get(origin) ?? 0);
  }

  // The courses due, those never read first, then those read longest ago,
  // each with as many of its files as fit in what its site's requests
  // leave: those the hub lacks first (their HEAD and their download), then
  // those it has, asked of longest ago first (their HEAD). A course passed
  // without some of those the hub lacks has them next run. A course whose
  // page doesn't fit, or none of whose files do, waits. Then the downloads.
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
    for (const course of due) {
      const url = new URL(course.url);
      const cached = this.pages.get(course.url);
      if (this.spare(url.origin) < (cached ? 0 : 1)) continue;
      let read, robots;
      try {
        read = cached ? { page: cached, at: url } : await this.page(url);
        robots = await this.robotsOf(url.origin);
      } catch (error) {
        if (!(error instanceof PageFailedError)) throw error;
        this.failed(course, error.message);
        continue;
      }
      if (!read) {
        this.failed(course, `${where(url)}: no wiki page`);
        continue;
      }
      // another page in its place (a redirect, a login): its own is away
      const own = ownAddress(read.page, read.at, this.hosts);
      if (own !== course.url) {
        this.failed(course, `${where(url)}: answered as ${own}`);
        continue;
      }
      const held = this.state.courses[course.id]?.f ?? {};
      const linked = documentsIn(read.page, course.wiki, this.hosts)
        .filter((doc) => robots.allowed(new URL(doc.url)))
        .map((doc) => ({ doc, id: `${course.id}|${doc.path}` }));
      const lacked = linked.filter(({ id }) => !(id in held));
      const had = linked
        .filter(({ id }) => id in held)
        .sort((a, b) => held[a.id] - held[b.id]);
      let left = this.spare(url.origin);
      const asked = new Set<string>();
      for (const { id } of [...lacked, ...had]) {
        const cost = id in held ? 1 : 2;
        if (cost > left) break;
        asked.add(id);
        left -= cost;
      }
      if (linked.length && !asked.size) continue;
      if (asked.size < linked.length)
        this.logger.warn(
          `${where(url)}: ${linked.length - asked.size} of its ${linked.length} files wait for the next run's requests`,
        );
      const whole = lacked.every(({ id }) => asked.has(id));
      const sent = await this.pass(course, read.page, linked, asked, whole);
      passed.push(sent);
      this.reserved.set(
        url.origin,
        (this.reserved.get(url.origin) ?? 0) + sent.fetch.length,
      );
      this.read++;
      if (whole) this.left--;
    }
    await this.download(passed);
  }

  // The course's page and the files asked of its links, as one pass. A
  // file not asked this run, or one the site fails to say anything of,
  // stays as it was; one its page no longer links, or the site answers 404
  // or 410 to, is gone. The course is read once it's whole and its
  // downloads are through; till then it's due again.
  private async pass(
    course: Course,
    page: SitePage,
    linked: { doc: Document; id: string }[],
    asked: ReadonlySet<string>,
    whole: boolean,
  ): Promise<Passed> {
    const before = this.state.courses[course.id];
    const held = before?.f ?? {};
    const found: Found[] = [];
    // still in its view, as they were
    const kept: Record<string, number> = {};
    for (const { id } of linked)
      if (!asked.has(id) && id in held) kept[id] = held[id];
    for (const { doc, id } of linked) {
      if (!asked.has(id)) continue;
      const head = await this.headOf(doc);
      if (head === 'gone') continue;
      if (head === null) {
        if (id in held) kept[id] = held[id];
        continue;
      }
      const mime = head.type.split(';')[0].trim();
      found.push({
        url: new URL(doc.url),
        upload: doc.upload,
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
    const now = { ...kept };
    for (const file of found)
      await this.skipRefused(`file ${file.record.externalId}`, async () => {
        if ((await pass.file(file.record)).fetch) fetch.push(file);
        now[file.record.externalId] = this.today;
      });

    const gone = Object.keys(held).filter((id) => !(id in now));
    // till the end goes through, its view holds what's gone too: an end
    // that fails leaves that for the next run to name
    this.state.courses[course.id] = {
      m: before?.m ?? null,
      d: before?.d ?? 0,
      f: { ...held, ...now },
    };
    await this.save();
    await pass.end({ files: gone });
    this.state.courses[course.id] = {
      m: change,
      d: whole && !fetch.length ? this.today : 0,
      f: now,
    };
    await this.save();
    return { course, pass, fetch, whole };
  }

  // What the site says of a file: null when it says nothing it can be
  // taken by (a failure, another page's address, a page in a document's
  // place outside the uploads), 'gone' for a 404 or a 410.
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
      if (head.type.includes('text/html') && !doc.upload) {
        this.logger.warn(`${doc.path}: answered with a page`);
        return null;
      }
      return head;
    } catch (error) {
      if (!(error instanceof RequestFailedError)) throw error;
      this.logger.warn(error.message);
      return null;
    }
  }

  // Once every pass has ended, the files the hub asked for; a course is
  // read once its downloads are through. One the run doesn't get through
  // is read again next run, when the hub asks for what it still lacks.
  private async download(passed: Passed[]) {
    for (const { course, pass, fetch, whole } of passed) {
      if (!fetch.length) continue;
      for (const file of fetch) await this.fetch(pass, file);
      if (whole) {
        this.state.courses[course.id].d = this.today;
        await this.save();
      }
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
    const cs = this.state.courses[course.id] ?? { m: null, d: 0, f: {} };
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
