import { Worker } from 'node:worker_threads';
import { firstMessage } from './parsing.js';

// a text body is cut here before it is parsed
export const MAX_HTML_CHARS = 2 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 20_000;
const HEAP_MB = 256;

export interface PageLink {
  // resolved against the page, without its fragment
  url: string;
  // as the page shows it, trimmed
  text: string;
  // in what's kept of the content element; else elsewhere on the page (its
  // menus, its footer), never in what the cleaning took out of the content
  inContent: boolean;
}

export interface SitePage {
  // the page's <title>, its control characters spaces, trimmed
  title: string;
  // the content element cleaned of all but its text, structure and links
  // (an `href`), up to 200,000 characters
  body: string;
  // its text, a line per block (a paragraph, an item, a cell), each line's
  // spaces one, up to 200,000 characters
  text: string;
  // the text's characters, spaces aside
  textChars: number;
  // the content's links in the page's order, but those `skip` matches,
  // then the rest of the page's
  links: PageLink[];
}

// the page could not be parsed in time and memory: it is a failed page
export class UnreadablePageError extends Error {
  constructor(url: URL, why: string) {
    super(`${url.pathname}: ${why}`);
    this.name = new.target.name;
  }
}

export interface ReadPageOptions {
  // where on the page its content is, a CSS selector
  content: string;
  // the content's links whose pathname or text it matches are left out:
  // tested in the page's thread, as a pattern may take long on what a page
  // holds
  skip?: RegExp;
}

// A page of a website, its content where `content` says, or null when the
// page has none there. Parsed in a worker thread of its own
// (site-page.worker.ts), from its first 2 MiB, in 20 s and 256 MB: cleaned
// of scripts, styles, navigation, forms, comments and attributes other than
// `href`.
export async function readPage(
  html: string,
  url: URL,
  { content, skip }: ReadPageOptions,
): Promise<SitePage | null> {
  // the bundler finds a worker's file only in `new Worker(new URL(...))`
  const worker = new Worker(new URL('./site-page.worker.ts', import.meta.url), {
    workerData: {
      html: html.slice(0, MAX_HTML_CHARS),
      url: url.href,
      content,
      skip: skip ? { source: skip.source, flags: skip.flags } : null,
    },
    resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
  });
  try {
    return (
      await firstMessage<{ page: SitePage | null }>(worker, PARSE_TIMEOUT_MS)
    ).page;
  } catch (error) {
    throw new UnreadablePageError(url, (error as Error).message);
  }
}
