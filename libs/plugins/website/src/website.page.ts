import { posix } from 'node:path';
import { readPage as readSitePage } from '@app/plugin-sdk';
import type { Section } from './website.config.js';

// less text than this, and no document, is a page with nothing to read
export const MIN_TEXT_CHARS = 30;

const DOCUMENTS = new Map([
  ['.pdf', 'application/pdf'],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
]);

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

// `<title>` up to the first ' – ' or ' | ', else the page's pathname
function titleOf(text: string, fallback: string) {
  const cuts = [' – ', ' | ']
    .map((sep) => text.indexOf(sep))
    .filter((at) => at >= 0);
  const title = (cuts.length ? text.slice(0, Math.min(...cuts)) : text).trim();
  return title || fallback;
}

const decoded = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// The page's content as the section says where it is, or null when the
// page has none there; its documents are the same-origin .pdf and .docx it
// links there, when the section reads files, but those skipFiles names.
export async function readPage(
  html: string,
  url: URL,
  section: Section,
): Promise<Page | null> {
  const { content, files, skipFiles } = section;
  const page = await readSitePage(html, url, { content, skip: skipFiles });
  if (!page) return null;
  const found = new Map<string, Document>();
  for (const link of files ? page.links : []) {
    if (!link.inContent) continue;
    const href = new URL(link.url);
    const mime = DOCUMENTS.get(posix.extname(href.pathname).toLowerCase());
    if (href.origin !== url.origin || !mime) continue;
    if (!found.has(href.pathname))
      found.set(href.pathname, {
        path: href.pathname,
        url: href.href,
        name: decoded(posix.basename(href.pathname)).replace(/\p{Cc}/gu, ''),
        mime,
      });
  }
  return {
    title: titleOf(page.title, url.pathname),
    body: page.body,
    textChars: page.textChars,
    documents: [...found.values()],
  };
}
