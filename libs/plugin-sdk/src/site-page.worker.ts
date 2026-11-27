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
// the text's length and its links but those `skip` matches; `{ page: null }`
// when the selector finds nothing.
const MAX_BODY_CHARS = 200_000;
// deeper than this is dropped, not walked
const MAX_DEPTH = 200;
const REMOVED = new Set(
  'script style noscript svg button nav form iframe template'.split(' '),
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

const $ = load(html);
const page = new URL(url);
const root = $(content).first();
if (!root.length) {
  parentPort!.postMessage({ page: null });
} else {
  // an explicit stack: a page nested deeper than the call stack is no crash
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
      node.attribs = node.attribs.href ? { href: node.attribs.href } : {};
      stack.push([node, depth + 1]);
      return true;
    });
  }

  // what's kept of its links, in the page's order
  const links = [];
  for (const a of root.find('a[href]').toArray()) {
    const href = hrefOf((a as Element).attribs.href, page);
    if (!href) continue;
    const text = spaced($(a).text());
    if (skipped?.test(new URL(href).pathname) || skipped?.test(text)) continue;
    links.push({ url: href, text });
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
    },
  });
}
