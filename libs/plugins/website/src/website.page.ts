import { Worker } from 'node:worker_threads';
import { firstMessage } from '@app/plugin-sdk';
import type { Section } from './website.config.js';

// less text than this, and no document, is a page with nothing to read
export const MIN_TEXT_CHARS = 30;
// a text body is cut here before it is parsed
export const MAX_HTML_CHARS = 2 * 1024 * 1024;
const PARSE_TIMEOUT_MS = 20_000;
const HEAP_MB = 256;

export interface Document {
  // its pathname, its id
  path: string;
  url: string;
  name: string;
  mime: string;
}

export interface Page {
  title: string;
  // the content element cleaned of all but its text, structure and links
  body: string;
  textChars: number;
  // all it links that the section reads, whoever holds them
  documents: Document[];
}

// the page could not be parsed in time and memory: it is a failed page
export class UnreadablePageError extends Error {
  constructor(url: URL, why: string) {
    super(`${url.pathname}: ${why}`);
    this.name = new.target.name;
  }
}

// The page's content as the section says where it is, or null when the
// page has none there. Parsed in a worker thread of its own
// (website.page.worker.ts).
export async function readPage(
  html: string,
  url: URL,
  section: Section,
): Promise<Page | null> {
  const { content, files, skipFiles } = section;
  // the bundler finds a worker's file only in `new Worker(new URL(...))`
  const worker = new Worker(
    new URL('./website.page.worker.ts', import.meta.url),
    {
      workerData: {
        html: html.slice(0, MAX_HTML_CHARS),
        url: url.href,
        content,
        files,
        skipFiles: skipFiles && {
          source: skipFiles.source,
          flags: skipFiles.flags,
        },
      },
      resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
    },
  );
  try {
    return (await firstMessage<{ page: Page | null }>(worker, PARSE_TIMEOUT_MS))
      .page;
  } catch (error) {
    throw new UnreadablePageError(url, (error as Error).message);
  }
}
