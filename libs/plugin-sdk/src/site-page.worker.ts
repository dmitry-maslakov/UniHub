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
// cleaned of all but its text, structure and links, with the page's title,
// the text's length, its links but those `skip` matches, each with the line
// of text it's on, and the addresses the rest of the page links;
// `{ page: null }` when the selector finds nothing.
const MAX_BODY_CHARS = 200_000;
// deeper than this is dropped, not walked
const MAX_DEPTH = 200;
const MAX_LINE_CHARS = 1_000;
const REMOVED = new Set(
  'script style noscript svg button nav form iframe template'.split(' '),
);
// what a line of the text ends at
const BLOCKS = new Set(
  'address article aside blockquote br dd details div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main ol p pre section summary table td th tr ul'.split(
    ' ',
  ),
);

const { html, url, content, skip } = workerData as {
  html: string;
  url: string;
  content: string;
  skip: RegExp | null;
};
// without the flags that make test() go on from where it last matched
const skipped =
  skip && new RegExp(skip.source, skip.flags.replace(/[gy]/g, ''));

const spaced = (text: string) => text.replace(/\s+/g, ' ').trim();

// an anchor's http(s) address, resolved and without its fragment; null for
// none, or another kind (mailto:, javascript:)
function hrefOf(href: string, base: URL) {
  try {
    const at = new URL(href, base);
    at.hash = '';
    return /^https?:$/.test(at.protocol) ? at.href : null;
  } catch {
    return null;
  }
}

// what ends a line, among the text's parts
const BREAK = Symbol('break');

// The lines of what's kept, a line per block (a <pre>'s own lines too), its
// spaces each one, and the line each of its anchors starts on
function linesOf(root: Element) {
  const lines: string[] = [];
  const lineOf = new Map<Element, number>();
  let current = '';
  const flush = () => {
    const line = spaced(current);
    if (line) lines.push(line);
    current = '';
  };
  const stack: ([Element, boolean] | string | typeof BREAK)[] = [[root, false]];
  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    if (at === BREAK) {
      flush();
      continue;
    }
    if (typeof at === 'string') {
      current += at;
      continue;
    }
    const [node, inPre] = at;
    // the line under way, once it's flushed
    if (node.name === 'a') lineOf.set(node, lines.length);
    const pre = inPre || node.name === 'pre';
    const block = BLOCKS.has(node.name);
    // pushed last to first, so the first comes off first
    if (block) stack.push(BREAK);
    for (const child of [...node.children].reverse()) {
      if (child.type === 'tag') stack.push([child, pre]);
      else if (child.type === 'text') {
        const parts = pre ? child.data.split('\n') : [child.data];
        for (let i = parts.length - 1; i >= 0; i--) {
          stack.push(parts[i]);
          if (i > 0) stack.push(BREAK);
        }
      }
    }
    if (block) stack.push(BREAK);
  }
  flush();
  return { lines, lineOf };
}

const $ = load(html);
const page = new URL(url);
const root = $(content).first();
if (!root.length) {
  parentPort!.postMessage({ page: null });
} else {
  const top = root[0] as Element;
  // the rest of the page's links, before the content is cleaned
  const otherLinks = $('a[href]')
    .toArray()
    .filter((a) => a !== top && !$.contains(top, a))
    .map((a) => hrefOf((a as Element).attribs.href, page))
    .filter((href) => href !== null);

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

  // what's kept of its links, in the page's order
  const { lines, lineOf } = linesOf(top);
  const links = [];
  for (const a of root.find('a[href]').toArray()) {
    const href = hrefOf((a as Element).attribs.href, page);
    if (!href) continue;
    const text = spaced($(a).text());
    if (skipped?.test(new URL(href).pathname) || skipped?.test(text)) continue;
    const line = (lines[lineOf.get(a as Element)!] ?? text).slice(
      0,
      MAX_LINE_CHARS,
    );
    links.push({ url: href, text, line });
  }

  parentPort!.postMessage({
    page: {
      title: spaced(
        $('title')
          .first()
          .text()
          .replace(/\p{Cc}+/gu, ' '),
      ),
      body: (root.html() ?? '').slice(0, MAX_BODY_CHARS),
      textChars,
      links,
      otherLinks,
    },
  });
}
