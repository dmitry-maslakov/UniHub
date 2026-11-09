import { posix } from 'node:path';
import { load } from 'cheerio';
import type { Section } from './website.config.js';

export const MAX_BODY_CHARS = 200_000;
// less text than this, and no document, is a page with nothing to read
export const MIN_TEXT_CHARS = 30;

const REMOVED =
  'script, style, noscript, svg, button, nav, form, iframe, template';
const DOCUMENTS = new Map([
  ['.pdf', 'application/pdf'],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
]);

type Dom = ReturnType<typeof load>;

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
// page has none there. `allowed` says whether robots.txt lets a document be
// read, `held` whether another page holds it.
export function readPage(
  html: string,
  url: URL,
  section: Section,
  allowed: (url: URL) => boolean,
  held: (path: string) => boolean,
): Page | null {
  const $ = load(html);
  const title = titleOf($('title').first().text(), url.pathname);
  const content = $(section.content).first();
  if (!content.length) return null;

  content.find(REMOVED).remove();
  const everything = content.find('*').addBack();
  everything
    .contents()
    .filter((_, node) => node.type === 'comment')
    .remove();
  // what a broken template leaves of a comment's end
  everything.contents().each((_, node) => {
    if (node.type === 'text') node.data = node.data.replaceAll('-->', '');
  });
  everything.each((_, node) => {
    if ('attribs' in node)
      node.attribs = node.attribs.href ? { href: node.attribs.href } : {};
  });

  const documents = section.files ? documentsOf($, content, url, section) : [];
  return {
    title,
    body: (content.html() ?? '').slice(0, MAX_BODY_CHARS),
    textChars: content.text().replace(/\s/g, '').length,
    documents: documents.filter(
      (doc) => allowed(new URL(doc.url)) && !held(doc.path),
    ),
  };
}

function documentsOf(
  $: Dom,
  content: ReturnType<Dom>,
  page: URL,
  { skipFiles }: Section,
) {
  const found = new Map<string, Document>();
  content.find('a[href]').each((_, a) => {
    let url: URL;
    try {
      url = new URL($(a).attr('href')!, page);
    } catch {
      return;
    }
    url.hash = '';
    const mime = DOCUMENTS.get(posix.extname(url.pathname).toLowerCase());
    if (url.origin !== page.origin || !mime) return;
    if (skipFiles?.test(url.pathname) || skipFiles?.test($(a).text().trim()))
      return;
    if (!found.has(url.pathname))
      found.set(url.pathname, {
        path: url.pathname,
        url: url.href,
        name: decoded(posix.basename(url.pathname)),
        mime,
      });
  });
  return [...found.values()];
}
