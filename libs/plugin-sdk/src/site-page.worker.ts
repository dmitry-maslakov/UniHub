import { parentPort, workerData } from 'node:worker_threads';
import { load } from 'cheerio';

type Element = Extract<
  ReturnType<ReturnType<typeof load>>[number],
  { attribs: object }
>;

// Run by site-page.ts in a thread of its own, one per page, so that a
// page's parsing never holds the hub's thread, and its memory and time are
// capped. Imports nothing of this repo: in tests node runs it as it is,
// types stripped.
//
// `{ html, url, content, skip }` posts `{ page }`: the content element
// cleaned of all but its text, structure and links, its text a line per
// block, the page's title and its links, but the content's whose pathname
// or text `skip` matches; `{ page: null }` when the selector finds nothing.
const MAX_BODY_CHARS = 200_000;
// deeper than this is dropped, not walked
const MAX_DEPTH = 200;
const REMOVED = new Set(
  'script style noscript svg button nav form iframe template'.split(' '),
);
// what ends a line of the text
const BLOCKS = new Set(
  'address article aside blockquote br dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main ol p pre section table td th tr ul'.split(
    ' ',
  ),
);

const { html, url, content, skip } = workerData as {
  html: string;
  url: string;
  content: string;
  skip: { source: string; flags: string } | null;
};
const skipped = skip && new RegExp(skip.source, skip.flags);

const clean = (text: string) => text.replace(/\p{Cc}+/gu, ' ').trim();

// an anchor's address, resolved and without its fragment; null when it's
// no address
function hrefOf(a: Element, base: URL) {
  try {
    const href = new URL(a.attribs.href, base);
    href.hash = '';
    return href.href;
  } catch {
    return null;
  }
}

// the text of what's kept, a line per block, its spaces each one
function textOf(root: Element) {
  const parts: string[] = [];
  const stack: (Element | string)[] = [root];
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    if (typeof at === 'string') {
      parts.push(at);
      continue;
    }
    const block = BLOCKS.has(at.name);
    if (block) stack.push('\n');
    for (const node of [...at.children].reverse()) {
      if (node.type === 'text') stack.push(node.data.replace(/\s+/g, ' '));
      else if (node.type === 'tag') stack.push(node);
    }
    if (block) stack.push('\n');
  }
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const $ = load(html);
const page = new URL(url);
const root = $(content).first();
if (!root.length) {
  parentPort!.postMessage({ page: null });
} else {
  const top = root[0] as Element;
  const link = (a: Element, inContent: boolean) => {
    const href = hrefOf(a, page);
    if (!href) return null;
    const text = $(a).text().trim();
    if (
      inContent &&
      (skipped?.test(new URL(href).pathname) || skipped?.test(text))
    )
      return null;
    return { url: href, text, inContent };
  };
  // the page's links outside the content, before it's cleaned
  const outside = $('a[href]')
    .toArray()
    .filter((a) => a !== top && !$.contains(top, a))
    .map((a) => link(a as Element, false));

  // an explicit stack: a page nested deeper than the call stack is no crash
  let textChars = 0;
  const stack: [Element, number][] = [[top, 0]];
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
      node.attribs = node.attribs.href ? { href: node.attribs.href } : {};
      stack.push([node, depth + 1]);
      return true;
    });
  }
  // what's kept of the content's links, in the page's order
  const inside = root
    .find('a[href]')
    .toArray()
    .map((a) => link(a as Element, true));

  parentPort!.postMessage({
    page: {
      title: clean($('title').first().text()),
      body: (root.html() ?? '').slice(0, MAX_BODY_CHARS),
      text: textOf(top).slice(0, MAX_BODY_CHARS),
      textChars,
      links: [...inside, ...outside].filter(Boolean),
    },
  });
}
