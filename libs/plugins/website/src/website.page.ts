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

// `<title>` up to the first ' – ' or ' | ' (one it starts with too, a
// template's empty name), else the page's pathname
const titleOf = (text: string, fallback: string) =>
  text.split(/(?:^|\s)[–|](?:\s|$)/)[0].trim() || fallback;

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
  const page = await readSitePage(html, url, {
    content,
    skip: files ? skipFiles : undefined,
  });
  if (!page) return null;
  const found = new Map<string, Document>();
  for (const link of files ? page.links : []) {
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
