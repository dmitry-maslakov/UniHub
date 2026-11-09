import { posix } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { load } from 'cheerio';

type Element = Extract<
  ReturnType<ReturnType<typeof load>>[number],
  { attribs: object }
>;

// Run by website.page.ts in a thread of its own, one per page, so that a
// page's parsing never holds the hub's thread, and its memory and time are
// capped. Imports nothing of this repo: in tests node runs it as it is,
// types stripped.
//
// `{ html, url, content, files, skipFiles }` posts `{ page }`: the content
// element cleaned of all but its text, structure and links, with its
// title, its text's length and the documents it links; `{ page: null }` when
// the selector finds nothing.
const MAX_BODY_CHARS = 200_000;
// deeper than this is dropped, not walked
const MAX_DEPTH = 200;
const REMOVED = new Set(
  'script style noscript svg button nav form iframe template'.split(' '),
);
const DOCUMENTS = new Map([
  ['.pdf', 'application/pdf'],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
]);

const { html, url, content, files, skipFiles } = workerData as {
  html: string;
  url: string;
  content: string;
  files: boolean;
  skipFiles: { source: string; flags: string } | null;
};

// `<title>` up to the first ' – ' or ' | ', else the page's pathname
function titleOf(text: string, fallback: string) {
  const cuts = [' – ', ' | ']
    .map((sep) => text.indexOf(sep))
    .filter((at) => at >= 0);
  const title = (cuts.length ? text.slice(0, Math.min(...cuts)) : text)
    .replace(/\p{Cc}+/gu, ' ')
    .trim();
  return title || fallback;
}

const decoded = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

const $ = load(html);
const page = new URL(url);
const root = $(content).first();
if (!root.length) {
  parentPort!.postMessage({ page: null });
} else {
  // an explicit stack: a page nested deeper than the call stack is no crash
  const links: Element[] = [];
  let textChars = 0;
  const stack: [Element, number][] = [[root[0] as Element, 0]];
  for (let at = stack.pop(); at; at = stack.pop()) {
    const [parent, depth] = at;
    parent.children = parent.children.filter((node) => {
      if (node.type === 'text') {
        // what a broken template leaves of a comment's end
        node.data = node.data.replaceAll('-->', '');
        textChars += node.data.replace(/\s/g, '').length;
        return true;
      }
      if (node.type !== 'tag' || REMOVED.has(node.name) || depth >= MAX_DEPTH)
        return false;
      if (node.name === 'a' && node.attribs.href) links.push(node);
      node.attribs = node.attribs.href ? { href: node.attribs.href } : {};
      stack.push([node, depth + 1]);
      return true;
    });
  }

  const skip = skipFiles && new RegExp(skipFiles.source, skipFiles.flags);
  const found = new Map<string, object>();
  for (const a of files ? links : []) {
    let href: URL;
    try {
      href = new URL(a.attribs.href, page);
    } catch {
      continue;
    }
    href.hash = '';
    const mime = DOCUMENTS.get(posix.extname(href.pathname).toLowerCase());
    if (href.origin !== page.origin || !mime) continue;
    if (skip?.test(href.pathname) || skip?.test($(a).text().trim())) continue;
    if (!found.has(href.pathname))
      found.set(href.pathname, {
        path: href.pathname,
        url: href.href,
        name: decoded(posix.basename(href.pathname)).replace(/\p{Cc}/gu, ''),
        mime,
      });
  }
  parentPort!.postMessage({
    page: {
      title: titleOf($('title').first().text(), page.pathname),
      body: (root.html() ?? '').slice(0, MAX_BODY_CHARS),
      textChars,
      documents: [...found.values()],
    },
  });
}
