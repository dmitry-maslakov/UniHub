import { Logger } from '@nestjs/common';
import robots from 'robots-parser';
import {
  InvalidRecordError,
  type Json,
  type PortalIngest,
} from '@app/plugin-sdk';
import {
  OutOfBudgetError,
  RequestFailedError,
  type SiteClient,
} from './website.client.js';
import type { Section } from './website.config.js';
import { MIN_TEXT_CHARS, readPage } from './website.page.js';
import { listed, type Listed } from './website.sitemap.js';
import { stateOf, type State } from './website.state.js';

// the package's types say `default`, its code exports the function itself
const robotsParser = robots as unknown as typeof robots.default;

const MIB = 1024 * 1024;
const SITEMAP_LIMIT = 16 * MIB;
const PAGE_LIMIT = 8 * MIB;
const ROBOTS_LIMIT = MIB;
const SAVE_EVERY = 100;
const FAILURES_IN_A_ROW = 20;
const MAX_CRAWL_DELAY_MS = 30_000;
const DAY_MS = 86_400_000;

// the site asks us to stop (429, 503), or keeps failing: the run ends,
// its state saved, and the next one goes on
class StopRunError extends Error {}

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
  private sinceSave = 0;
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
    } finally {
      // a run the hub let go of can't save: it has been told already
      await this.save().catch((error: unknown) => {
        if (!this.o.signal.aborted) throw error;
      });
      this.logger.log(
        `read ${this.read} pages, stored ${this.stored} documents, removed ${this.removed}, ${this.left} left due`,
      );
    }
  }

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
    const sitemap = await this.sitemap(section);
    if (!sitemap) return;
    await this.removeUnlisted(section, sitemap);
    const { pages } = this.state;
    const due = sitemap
      .filter((page) => this.allowed(page.url) && this.isDue(section, page))
      .sort((a, b) => {
        const [x, y] = [pages[a.path], pages[b.path]];
        return (
          (x?.s === section.id ? x.d : -Infinity) -
            (y?.s === section.id ? y.d : -Infinity) ||
          (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
        );
      });
    this.left += due.length;
    for (const page of due) {
      await this.page(section, page);
      if (++this.sinceSave >= SAVE_EVERY) await this.save();
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
    if (read?.s !== section.id) return true;
    // a lastmod that is always today says nothing: the days do
    if (section.revisitDays) return this.today - read.d >= section.revisitDays;
    return lastmod !== null && lastmod !== read.m;
  }

  private async page(section: Section, listing: Listed) {
    const { client, ingest } = this.o;
    const { path, url } = listing;
    const known = this.state.pages[path];
    const prior = known?.s === section.id ? known : undefined;
    let answer;
    try {
      answer = await client.text(url, PAGE_LIMIT);
    } catch (error) {
      if (error instanceof RequestFailedError)
        return this.failed(error.message);
      throw error;
    }
    const { status } = answer;
    if (status === 429 || status === 503)
      throw new StopRunError(`the site answered ${status}`);
    if (status === 404 || status === 410) {
      this.failures = 0;
      this.left--;
      return this.removePage(path);
    }
    if (!ok(status)) return this.failed(`${path}: the site answered ${status}`);
    this.failures = 0;
    this.read++;
    this.left--;

    const mark = (f: string[]) => {
      this.state.pages[path] = {
        s: section.id,
        m: listing.lastmod,
        d: this.today,
        f,
      };
    };
    const page = readPage(answer.body, answer.url, section, this.allowed, (p) =>
      this.heldElsewhere(p, path),
    );
    if (!page) {
      this.logger.warn(`${path}: none of ${section.content} on the page`);
      return mark(prior?.f ?? []);
    }
    if (page.textChars < MIN_TEXT_CHARS && !page.documents.length) {
      if (prior) {
        await this.count(ingest.removeItem(path));
        await this.dropFiles(prior.f, [], path);
      }
      return mark([]);
    }

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
    for (const doc of page.documents) {
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
    const f = page.documents.map(({ path }) => path);
    await this.dropFiles(prior?.f ?? [], f, path);
    mark(f);
  }

  // A document that can't be had is a warning and the page still counts as
  // read; out of requests, the page is left for the next run.
  private async download(path: string, href: string) {
    const url = new URL(href);
    try {
      const { status, body } = await this.o.client.stream(url);
      try {
        if (status === 429 || status === 503)
          throw new StopRunError(`the site answered ${status}`);
        if (!ok(status))
          return this.logger.warn(`${path}: the site answered ${status}`);
        await this.o.ingest.content(path, body);
      } finally {
        body.destroy();
      }
    } catch (error) {
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

  private failed(message: string) {
    this.logger.warn(message);
    if (++this.failures >= FAILURES_IN_A_ROW)
      throw new StopRunError(`${FAILURES_IN_A_ROW} requests failed in a row`);
  }

  private async removePage(path: string) {
    const read = this.state.pages[path];
    if (!read) return;
    await this.count(this.o.ingest.removeItem(path));
    await this.dropFiles(read.f, [], path);
    delete this.state.pages[path];
  }

  // documents `self` held and no longer does, and no other page holds
  private async dropFiles(before: string[], now: string[], self: string) {
    for (const file of before)
      if (!now.includes(file) && !this.heldElsewhere(file, self))
        await this.count(this.o.ingest.removeFile(file));
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
    await this.o.ingest.saveState(this.state as unknown as Json);
  }
}
