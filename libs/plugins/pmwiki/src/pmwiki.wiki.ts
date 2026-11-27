import { posix } from 'node:path';
import type { PageLink, SitePage } from '@app/plugin-sdk';

// What PmWiki's pages say, read off them as the sdk's readPage gives them:
// a page's text is in its #wikitext, and its skin links the page's actions
// (?action=print, edit, history…) outside of it (otherLinks), at the page's
// own address.

export const CONTENT = '#wikitext';

// the wiki's lists, at addresses every PmWiki answers
export const changesOf = (wiki: string) =>
  new URL('?n=Site.AllRecentChanges', wiki);
export const pagesOf = (wiki: string) =>
  new URL('?n=Site.Search&action=search&q=%2F', wiki);

// the page actions a skin links, each at the page's own address
const ACTIONS = new Set(
  'attr browse diff edit history login logout print rss search source upload'.split(
    ' ',
  ),
);

// what a link to a file is, wherever on the site, besides the wiki's uploads
const DOCUMENTS = new Set(
  '.pdf .doc .docx .ppt .pptx .pps .ppsx .xls .xlsx .odt .odp .ods .rtf .txt .tex .zip .tar .gz .rar .7z .djvu .epub'.split(
    ' ',
  ),
);

const NAME_CHARS = 200;

// A link's address as the wiki's are compared: https for one of the wikis'
// sites asked over http (a wiki's links to its own uploads often are);
// null for an address of no listed site.
export function onSites(href: string, hosts: ReadonlySet<string>) {
  const url = new URL(href);
  if (!hosts.has(url.host)) return null;
  if (url.protocol === 'http:') url.protocol = 'https:';
  return url.protocol === 'https:' ? url : null;
}

// a page's address without the action a link asks of it, but its name
// (?n=Group.Name), for a wiki without clean addresses
function pageAt(url: URL) {
  const name = url.searchParams.get('n');
  const page = new URL(url.pathname, url.origin);
  if (name) page.searchParams.set('n', name);
  return page;
}

// The page's own address, from the links of its actions: the one most of
// them go to. Null for a page with none, which is no wiki's.
export function canonicalOf(page: SitePage, hosts: ReadonlySet<string>) {
  const seen = new Map<string, number>();
  for (const href of page.otherLinks) {
    const url = onSites(href, hosts);
    const action = url?.searchParams.get('action');
    if (!url || !action || !ACTIONS.has(action)) continue;
    const at = pageAt(url).href;
    seen.set(at, (seen.get(at) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [at, count] of seen)
    if (best === null || count > seen.get(best)!) best = at;
  return best;
}

// A page's own address: as its action links say, or, for a skin that shows
// none, the address it answered at; null for one on no listed site.
export function ownAddress(
  page: SitePage,
  at: URL,
  hosts: ReadonlySet<string>,
) {
  const answered = onSites(at.href, hosts);
  return canonicalOf(page, hosts) ?? (answered && pageAt(answered).href);
}

// the listed wiki a page is of, by its address: the longest that starts it
export function wikiOf(page: string, wikis: readonly string[]) {
  let owner: string | null = null;
  for (const wiki of wikis)
    if (page.startsWith(wiki) && (!owner || wiki.length > owner.length))
      owner = wiki;
  return owner;
}

// A wiki's title, its <title> up to ' | ' (PmWiki's skins title a page
// '$WikiTitle | $Group / $Title'); '' when it has no such part.
export function titleOf(page: SitePage) {
  const at = page.title.indexOf(' | ');
  return at > 0 ? page.title.slice(0, at).trim() : '';
}

// Site.AllRecentChanges: each page's address and what's said of its last
// change ('2026-11-22 17:05 UTC+1'), a line per page: its link, ' . . . ',
// the time, and ' by ' its author. The time is only compared, never read,
// as each wiki writes it its own way ($TimeFmt).
export function changesIn(page: SitePage, hosts: ReadonlySet<string>) {
  const changes = new Map<string, string>();
  for (const link of page.links) {
    const lead = `${link.text} . . . `;
    if (!link.text || !link.line.startsWith(lead)) continue;
    const url = onSites(link.url, hosts);
    if (!url || url.searchParams.has('action')) continue;
    const at = pageAt(url).href;
    if (!changes.has(at))
      changes.set(at, link.line.slice(lead.length).split(' by ')[0].trim());
  }
  return changes;
}

// when a change was, for a time written as ISO's (the wikis we know of do:
// '2026-11-22 17:05 UTC+1'); null for any other way
export function timeOf(change: string) {
  const at =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(?:UTC|GMT)?\s*([+-])(\d{1,2})(?::?(\d{2}))?)?/.exec(
      change,
    );
  if (!at) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = at;
  const offset =
    (sign === '-' ? -1 : 1) * (Number(oh ?? 0) * 60 + Number(om ?? 0));
  const time = new Date(
    Date.UTC(+y, +mo - 1, +d, +h, +mi, Number(s ?? 0)) - offset * 60_000,
  );
  return Number.isNaN(time.getTime()) ? null : time;
}

// The wiki's page of its courses, in its list of pages (Site.Search for
// '/'): the page named Teaching, of any group, or else the home page of the
// group Courses; null when it has neither.
export function indexIn(list: SitePage, hosts: ReadonlySet<string>) {
  const named = (name: string) => list.links.find((link) => link.text === name);
  const link = named('Teaching') ?? named('Courses');
  const url = link && onSites(link.url, hosts);
  return url && !url.searchParams.has('action') ? pageAt(url).href : null;
}

const isDocument = (url: URL, uploads: string | null) =>
  (uploads !== null && url.pathname.startsWith(uploads)) ||
  DOCUMENTS.has(posix.extname(url.pathname).toLowerCase());

// where a wiki keeps what's uploaded to it (PmWiki's uploads/)
const uploadsOf = (wiki: string) => new URL('uploads/', wiki).pathname;

export interface CourseLink {
  // the page it links, not yet known to be a wiki's
  url: string;
  // the line it's on, or its own text where that line is long, without a
  // closing colon
  name: string;
}

// The pages an index links on the listed sites, each once, in its order:
// neither an action's link nor a file's. Each is named by the line it's
// on, or, where that line links several, by its part of it, from its link
// to the next.
export function courseLinks(
  index: SitePage,
  wikis: readonly string[],
  hosts: ReadonlySet<string>,
): CourseLink[] {
  const candidates: { at: string; link: PageLink }[] = [];
  for (const link of index.links) {
    const url = onSites(link.url, hosts);
    if (!url || url.searchParams.has('action')) continue;
    const wiki = wikiOf(url.href, wikis);
    if (isDocument(url, wiki && uploadsOf(wiki))) continue;
    candidates.push({ at: pageAt(url).href, link });
  }
  const found = new Map<string, CourseLink>();
  candidates.forEach(({ at, link }, i) => {
    const next = candidates[i + 1]?.link;
    const shared = candidates.filter((c) => c.link.line === link.line);
    const name =
      shared.length > 1
        ? partOf(link, next?.line === link.line ? next : null)
        : nameOf(link);
    if (!found.has(at)) found.set(at, { url: at, name });
  });
  return [...found.values()];
}

function nameOf(link: PageLink) {
  const name = link.line.length <= NAME_CHARS ? link.line : link.text;
  return trimmed(name) || link.text;
}

// a link's part of a line it shares: from its text to the next link's
function partOf(link: PageLink, next: PageLink | null) {
  const from = link.text ? link.line.indexOf(link.text) : -1;
  if (from < 0) return link.text;
  const to = next?.text
    ? link.line.indexOf(next.text, from + link.text.length)
    : -1;
  const part = link.line.slice(from, to < 0 ? undefined : to);
  return trimmed(part.length <= NAME_CHARS ? part : link.text) || link.text;
}

// without what ends a list's item or a label: a colon, a comma, a dash
const trimmed = (name: string) => name.replace(/[\s,;:–-]+$/, '').trim();

// A wiki's home page (PmWiki's Main.HomePage, its group's home Main.Main,
// or the wiki's own address), which an index links as its way back, and
// is no course
export function isHome(page: string, wiki: string) {
  const url = new URL(page);
  const name = url.searchParams.get('n');
  const rest = name ?? page.slice(wiki.length).split('?')[0];
  return /^(?:(?:index\.php|pmwiki\.php)?|Main(?:[./](?:Main|HomePage))?\/?)$/i.test(
    rest,
  );
}

// the page's own name, the last part of its address ('Teaching')
export function pageName(page: string) {
  const url = new URL(page);
  const name = url.searchParams.get('n');
  if (name) return name.split('.').pop()!;
  const parts = url.pathname.split('/').filter(Boolean);
  return parts.length ? decoded(parts.at(-1)!) : url.host;
}

// a course's name: what its index says of it, and whose wiki it's on
export const courseName = (name: string, wikiTitle: string) =>
  wikiTitle ? `${name} (${wikiTitle})` : name;

export interface Document {
  // its pathname (and the upload's name, for one PmWiki serves itself), how
  // its file is told apart within the course
  path: string;
  url: string;
  name: string;
  // a file as it was uploaded to the wiki, whatever its type (an .htm of
  // results is one), not a page the site makes
  upload: boolean;
}

const decoded = (text: string) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// The files a wiki's page links, each once: whatever it links in the
// wiki's uploads (or PmWiki serves, ?action=download&upname=, where it
// keeps them from being linked straight), and the documents it links
// elsewhere on the wiki's site (.pdf, .docx, .pptx, .zip…).
export function documentsIn(
  page: SitePage,
  wiki: string,
  hosts: ReadonlySet<string>,
): Document[] {
  const host = new URL(wiki).host;
  const uploads = uploadsOf(wiki);
  const found = new Map<string, Document>();
  const add = (doc: Document) => {
    if (!found.has(doc.path)) found.set(doc.path, doc);
  };
  for (const link of page.links) {
    const url = onSites(link.url, hosts);
    if (!url || url.host !== host) continue;
    const upname = url.searchParams.get('upname');
    if (url.searchParams.get('action') === 'download' && upname) {
      const name = posix.basename(upname).replace(/\p{Cc}/gu, '');
      if (name)
        add({
          path: `${url.pathname}?upname=${encodeURIComponent(upname)}`,
          url: url.href,
          name,
          upload: true,
        });
      continue;
    }
    if (url.search || url.pathname.endsWith('/')) continue;
    if (!isDocument(url, uploads)) continue;
    add({
      path: url.pathname,
      url: url.href,
      name: decoded(posix.basename(url.pathname)).replace(/\p{Cc}/gu, ''),
      upload: url.pathname.startsWith(uploads),
    });
  }
  return [...found.values()];
}
