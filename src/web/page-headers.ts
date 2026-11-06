import type { ServerResponse } from 'node:http';
import { relative, sep } from 'node:path';

// What the web app's pages may load: its own scripts, styles, fonts and
// images, and calls to its own origin. No forms post anywhere (every action
// is a fetch with JSON), nothing frames it and no <base> moves its links.
const directives = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  // Mantine puts its theme in <style> tags and a component's variables in
  // its style attribute. Styles can't call out on their own: images, fonts
  // and connections stay 'self'
  'style-src': ["'self'", "'unsafe-inline'"],
  // the app's own font files
  'font-src': ["'self'"],
  'img-src': ["'self'"],
  'connect-src': ["'self'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'none'"],
  // no Trusted Types: Mantine writes those <style> tags through innerHTML,
  // which require-trusted-types-for 'script' refuses
};

export const PAGE_CSP = Object.entries(directives)
  .map(([name, sources]) => `${name} ${sources.join(' ')}`)
  .join('; ');

// index.html is asked for anew each time, so a release shows at once; the
// files Vite names by their hash never change, so they're kept for a year
export function cacheControl(file: string) {
  if (file.endsWith('.html')) return 'no-store';
  if (file.startsWith(`assets${sep}`))
    return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

// serve-static's setHeaders, for every file of the app under `root` and
// for index.html wherever it answers. They replace helmet's CSP on these
// responses alone, so the API and its docs keep helmet's.
export const pageHeaders =
  (root: string) => (res: ServerResponse, path: string) => {
    res.setHeader('Content-Security-Policy', PAGE_CSP);
    res.setHeader('Cache-Control', cacheControl(relative(root, path)));
  };
