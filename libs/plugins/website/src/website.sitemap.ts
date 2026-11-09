import type { Section } from './website.config.js';

export interface Listed {
  // the page's pathname, its id
  path: string;
  url: URL;
  lastmod: string | null;
}

const ENTRY = /<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
const ENTITY = /&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi;
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

// XML's entities, in one pass so &amp;lt; stays &lt;
export const decodeEntities = (text: string) =>
  text.replace(ENTITY, (whole, hex?: string, dec?: string, name?: string) => {
    if (name) return NAMED[name.toLowerCase()];
    const code = hex ? parseInt(hex, 16) : Number(dec);
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

// The pages a sitemap lists for a section: those on the site whose pathname
// the section takes, each pathname once (the first listing's lastmod).
export function listed(xml: string, origin: string, section: Section) {
  const pages = new Map<string, Listed>();
  for (const [, loc, lastmod] of xml.matchAll(ENTRY)) {
    const url = parse(decodeEntities(loc.trim()), origin);
    if (url?.origin !== origin) continue;
    const { pathname } = url;
    if (section.include && !section.include.test(pathname)) continue;
    if (section.exclude?.test(pathname)) continue;
    if (!pages.has(pathname))
      pages.set(pathname, {
        path: pathname,
        url,
        lastmod: lastmod ? decodeEntities(lastmod.trim()) : null,
      });
  }
  return [...pages.values()];
}

function parse(href: string, base: string) {
  try {
    const url = new URL(href, base);
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}
