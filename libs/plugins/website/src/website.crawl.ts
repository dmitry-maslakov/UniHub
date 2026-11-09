import { Logger } from '@nestjs/common';
import robots from 'robots-parser';
import {
  InvalidRecordError,
  UnknownReferenceError,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';
import {
  OutOfBudgetError,
  RequestFailedError,
  type SiteClient,
} from './website.client.js';
import type { Section } from './website.config.js';
import {
  MIN_TEXT_CHARS,
  readPage,
  UnreadablePageError,
} from './website.page.js';
import { listed, type Listed } from './website.sitemap.js';
import { stateOf, unread, type State } from './website.state.js';

// the package's types say `default`, its code exports the function itself
const robotsParser = robots as unknown as typeof robots.default;

const MIB = 1024 * 1024;
const SITEMAP_LIMIT = 16 * MIB;
const PAGE_LIMIT = 8 * MIB;
const ROBOTS_LIMIT = MIB;
const SAVE_EVERY = 100;
const SAVE_EVERY_MS = 5 * 60_000;
const FAILURES_IN_A_ROW = 20;
// a page that looks gone or wrong (not found, its content gone or too short,
// another page's answer) is removed when a later day says so too
const DAYS_TO_CONFIRM = 2;
const WRONG_IN_A_ROW = 5;
const GONE_IN_A_ROW = 10;
const MAX_CRAWL_DELAY_MS = 30_000;
const DAY_MS = 86_400_000;

// the site asks us to stop (429, 503), or keeps failing: the run ends,
// its state saved, and the next one goes on
class StopRunError extends Error {}
// many pages gone at once is the site's doing: none is removed
class SiteGoneError extends StopRunError {}

// what one page's trouble is, not the run's
const isPageTrouble = (error: unknown) =>
  error instanceof InvalidRecordError ||
  error instanceof UnknownReferenceError ||
  error instanceof RangeError ||
  error instanceof UnreadablePageError;

// the same pathname, a trailing slash aside
const sameApart = (a: URL, b: URL) =>
  a.pathname.replace(/(?<=.)\/$/, '') === b.pathname.replace(/(?<=.)\/$/, '');

const ok = (status: number) => status >= 200 && status < 300;

export interface CrawlOptions {
  origin: string;
  userAgent: string;
  sections: Section[];
  ingest: PortalIngest;
  client: SiteClient;
  signal: AbortSignal;
}

// One run over the site's sections (README, Website)
export class Crawl {
  private readonly logger = new Logger('WebsiteConnector');
  private state: State = { v: 1, pages: {} };
  private robots = robotsParser('', '');
  private readonly today = Math.floor(Date.now() / DAY_MS);
  private failures = 0;
  private wrong = 0;
  private gone = 0;
  // pages confirmed gone, removed once the run isn't stopped by a streak
  private confirmed: string[] = [];
  private readonly claimed = new Set<string>();
  private sinceSave = 0;
  private savedAt = Date.now();
  private read = 0;
  private stored = 0;
  private removed = 0;
  private left = 0;

  constructor(private readonly o: CrawlOptions) {}

  async run() {
    this.state = stateOf(await this.o.ingest.state());
    try {
      await this.crawl();
    } catch (error) {
      if (error instanceof OutOfBudgetError)
        this.logger.warn('out of requests: the next run goes on');
      else if (error instanceof StopRunError)
        this.logger.warn(`${error.message}: the next run goes on`);
      else throw error;
      if (error instanceof SiteGoneError) this.confirmed = [];
    } finally {
      await this.removeConfirmed().catch(this.ifAborted);
      // a run the hub let go of can't save: it has been told already
      await this.save().catch(this.ifAborted);
      this.logger.log(
        `read ${this.read} pages, stored ${this.stored} documents, removed ${this.removed}, ${this.left} left due`,
      );
    }
  }

  private readonly ifAborted = (error: unknown) => {
    if (!this.o.signal.aborted) throw error;
  };

  private async crawl() {
    const { ingest, origin, sections } = this.o;
    await this.loadRobots();
    for (const { id, name } of sections)
      await ingest.course({ externalId: id, name, url: origin });
    for (const section of sections) await this.section(section);
  }

  private async loadRobots() {
    const url = new URL('/robots.txt', this.o.origin);
    const answer = await this.o.client.text(url, ROBOTS_LIMIT).catch((e) => {
      if (e instanceof RequestFailedError) throw new Error(e.message);
      throw e;
    });
    if (answer.status !== 404 && !ok(answer.status))
      throw new Error(`robots.txt: the site answered ${answer.status}`);
    this.robots = robotsParser(url.href, ok(answer.status) ? answer.body : '');
    const wait = (this.robots.getCrawlDelay(this.o.userAgent) ?? 0) * 1000;
    if (wait > this.o.client.delayMs)
      this.o.client.delayMs = Math.min(wait, MAX_CRAWL_DELAY_MS);
  }

  private readonly allowed = (url: URL) =>
    this.robots.isAllowed(url.href, this.o.userAgent) !== false;

  private async section(section: Section) {
    const all = await this.sitemap(section);
    if (!all) return;
    // a path two sections match belongs to the first configured
    const sitemap = all.filter(({ path }) => !this.claimed.has(path));
    for (const { path } of sitemap) this.claimed.add(path);
    await this.removeUnlisted(section, sitemap);
    const { pages } = this.state;
    const readAt = (path: string) =>
      pages[path]?.s === section.id && pages[path].d
        ? pages[path].d
        : -Infinity;
    const due = sitemap
      .filter((page) => this.allowed(page.url) && this.isDue(section, page))
      .sort(
        (a, b) =>
          // pages that failed last, so that they can't starve the rest
          Number(pages[a.path]?.a !== undefined) -
            Number(pages[b.path]?.a !== undefined) ||
          readAt(a.path) - readAt(b.path) ||
          (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
      );
    this.left += due.length;
    for (const page of due) {
      await this.page(section, page);
      if (
        ++this.sinceSave >= SAVE_EVERY ||
        Date.now() - this.savedAt >= SAVE_EVERY_MS
      )
        await this.save();
    }
  }

  // null: the sitemap failed, and the section waits for the next run
  private async sitemap(section: Section) {
    const url = new URL(section.sitemap, this.o.origin);
    try {
      const answer = await this.o.client.text(url, SITEMAP_LIMIT);
      if (!ok(answer.status))
        throw new RequestFailedError(url, `answered ${answer.status}`);
      return listed(answer.body, this.o.origin, section);
    } catch (error) {
      if (!(error instanceof RequestFailedError)) throw error;
      this.logger.warn(
        `section ${section.id}: sitemap failed, ${error.message}`,
      );
      return null;
    }
  }

  // pages the sitemap no longer lists are gone, unless it lists so few of
  // them that it is likelier broken
  private async removeUnlisted(section: Section, sitemap: Listed[]) {
    const listedPaths = new Set(sitemap.map(({ path }) => path));
    const mine = Object.keys(this.state.pages).filter(
      (path) => this.state.pages[path].s === section.id,
    );
    const gone = mine.filter((path) => !listedPaths.has(path));
    if (!gone.length) return;
    if ((mine.length - gone.length) * 2 < mine.length)
      return this.logger.warn(
        `section ${section.id}: the sitemap lists ${mine.length - gone.length} of ${mine.length} pages: nothing removed`,
      );
    for (const path of gone) await this.removePage(path);
  }

  private isDue(section: Section, { path, lastmod }: Listed) {
    const read = this.state.pages[path];
    if (read?.a === this.today) return false;
    // never read, or to be read again: it failed, or lost its document's holder
    if (!read || read.s !== section.id || !read.d || read.a !== undefined)
      return true;
    // a lastmod that is always today says nothing: the days do
    if (section.revisitDays) return this.today - read.d >= section.revisitDays;
    return lastmod !== null && lastmod !== read.m;
  }

  private async page(section: Section, listing: Listed) {
    try {
      await this.readOne(section, listing);
    } catch (error) {
      if (!isPageTrouble(error)) throw error;
      this.failed(section, listing.path, (error as Error).message);
    }
  }

  private async readOne(section: Section, listing: Listed) {
    const { client, ingest } = this.o;
    const { path, url } = listing;
    const prior = this.state.pages[path];
    let answer;
    try {
      answer = await client.text(url, PAGE_LIMIT);
    } catch (error) {
      if (error instanceof RequestFailedError)
        return this.failed(section, path, error.message);
      throw error;
    }
    const { status } = answer;
    if (status === 429 || status === 503)
      throw new StopRunError(`the site answered ${status}`);
    if (status === 404 || status === 410) {
      this.left--;
      if (++this.gone >= GONE_IN_A_ROW)
        throw new SiteGoneError(`${GONE_IN_A_ROW} pages gone in a row`);
      return this.suspect(
        section,
        listing,
        `${path}: the site answered ${status}`,
        true,
      );
    }
    if (this.gone) {
      this.gone = 0;
      await this.removeConfirmed();
    }
    if (!ok(status))
      return this.failed(section, path, `${path}: the site answered ${status}`);
    if (!sameApart(answer.url, url))
      return this.failed(
        section,
        path,
        `${path}: answered as ${answer.url.pathname}`,
      );

    const page = await readPage(answer.body, answer.url, section);
    this.failures = 0;
    this.read++;
    this.left--;
    if (!page || (page.textChars < MIN_TEXT_CHARS && !page.documents.length)) {
      if (!page)
        this.logger.warn(`${path}: none of ${section.content} on the page`);
      // a post that was kept is not dropped on one look
      if (prior?.k)
        return this.suspect(section, listing, `${path}: nothing to keep in it`);
      return this.mark(section, listing, [], [], false);
    }
    this.wrong = 0;

    const links = page.documents.filter((doc) =>
      this.allowed(new URL(doc.url)),
    );
    const mine = links.filter((doc) => !this.heldElsewhere(doc.path, path));
    const stamp = new Date(listing.lastmod ?? NaN);
    const dated =
      !section.revisitDays && !Number.isNaN(stamp.getTime()) ? stamp : null;
    await ingest.item({
      externalId: path,
      course: section.id,
      kind: section.kind,
      title: page.title,
      url: url.href,
      ...(dated && { publishedAt: dated }),
      raw: { body: page.body },
    });
    for (const doc of mine) {
      const { needsContent } = await ingest.file({
        externalId: doc.path,
        course: section.id,
        item: path,
        name: doc.name,
        url: doc.url,
        mime: doc.mime,
        ...(dated && { updatedAt: dated }),
      });
      this.stored++;
      if (needsContent) await this.download(doc.path, doc.url);
    }
    const f = mine.map(({ path }) => path);
    await this.release(prior?.f ?? [], path, f);
    this.mark(
      section,
      listing,
      f,
      links.map(({ path }) => path),
      true,
    );
  }

  private mark(
    section: Section,
    { path, lastmod }: Listed,
    f: string[],
    l: string[],
    k: boolean,
  ) {
    this.state.pages[path] = {
      s: section.id,
      m: lastmod,
      d: this.today,
      f,
      l,
      k,
      b: 0,
    };
  }

  // The page looks gone or wrong, which one look can't tell from the site
  // having a bad day: it stays as it is, tried again another day, and goes
  // when a later day agrees. `gone` is the site's 404 or 410.
  private async suspect(
    section: Section,
    listing: Listed,
    message: string,
    gone = false,
  ) {
    const { path } = listing;
    this.logger.warn(message);
    const known = this.state.pages[path];
    const next = { ...(known ?? unread(section.id)) };
    next.b++;
    next.a = this.today;
    this.state.pages[path] = next;
    if (!gone && ++this.wrong >= WRONG_IN_A_ROW)
      throw new StopRunError(`${WRONG_IN_A_ROW} pages looked wrong in a row`);
    if (next.b < DAYS_TO_CONFIRM || !(next.k || next.f.length)) return;
    if (gone) this.confirmed.push(path);
    else await this.drop(section, listing);
  }

  // A document that can't be had is a warning and the page still counts as
  // read; out of requests, the page is left for the next run.
  private async download(path: string, href: string) {
    const url = new URL(href);
    try {
      const { status, body, url: from, type } = await this.o.client.stream(url);
      try {
        if (status === 429 || status === 503)
          throw new StopRunError(`the site answered ${status}`);
        if (!ok(status))
          return this.logger.warn(`${path}: the site answered ${status}`);
        // a page in a document's place: a login, an error, another file
        if (type.includes('text/html') || !sameApart(from, url))
          return this.logger.warn(`${path}: answered with another page`);
        await this.o.ingest.content(path, body);
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
        return this.logger.warn(`${path}: too large to keep`);
      throw error;
    }
  }

  // the page stays as it was, and is tried again another day
  private failed(section: Section, path: string, message: string) {
    this.logger.warn(message);
    const known = this.state.pages[path] ?? unread(section.id);
    this.state.pages[path] = { ...known, a: this.today };
    if (++this.failures >= FAILURES_IN_A_ROW)
      throw new StopRunError(`${FAILURES_IN_A_ROW} requests failed in a row`);
  }

  // the pages 404 or 410 confirmed gone, once no streak says it's the site
  private async removeConfirmed() {
    const paths = this.confirmed;
    this.confirmed = [];
    for (const path of paths) await this.removePage(path);
  }

  // a page whose post is gone, and the documents it held
  private async drop(section: Section, listing: Listed) {
    const { path } = listing;
    await this.count(this.o.ingest.removeItem(path));
    await this.release(this.state.pages[path].f, path);
    this.mark(section, listing, [], [], false);
  }

  private async removePage(path: string) {
    const read = this.state.pages[path];
    if (!read) return;
    if (read.k) await this.count(this.o.ingest.removeItem(path));
    await this.release(read.f, path);
    delete this.state.pages[path];
  }

  // Documents `self` held and no longer does. One that another page links is
  // that page's now, which is made due to take it over; one that none links
  // is removed.
  private async release(before: string[], self: string, now: string[] = []) {
    for (const file of before) {
      if (now.includes(file) || this.heldElsewhere(file, self)) continue;
      const takers = Object.entries(this.state.pages).filter(
        ([path, read]) => path !== self && read.l.includes(file),
      );
      for (const [, taker] of takers) {
        taker.m = null;
        taker.d = 0;
      }
      if (!takers.length) await this.count(this.o.ingest.removeFile(file));
    }
  }

  private async count(removing: Promise<{ changed: boolean }>) {
    if ((await removing).changed) this.removed++;
  }

  private heldElsewhere(file: string, self: string) {
    return Object.entries(this.state.pages).some(
      ([path, read]) => path !== self && read.f.includes(file),
    );
  }

  private async save() {
    this.sinceSave = 0;
    this.savedAt = Date.now();
    await this.o.ingest.saveState(this.state as unknown as Json);
  }
}
