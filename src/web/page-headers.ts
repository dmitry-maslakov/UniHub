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

// serve-static's setHeaders, for every file of the app under `root` and
// for index.html wherever it answers. The pages get the CSP above, in place
// of helmet's, and are asked for anew each time, so a release shows at once;
// the files Vite names by their hash never change and are kept for a year.
// The rest keep helmet's and serve-static's headers, the API and its docs too.
export const pageHeaders =
  (root: string) => (res: ServerResponse, path: string) => {
    const file = relative(root, path);
    if (file.endsWith('.html')) {
      res.setHeader('Content-Security-Policy', PAGE_CSP);
      res.setHeader('Cache-Control', 'no-store');
    } else if (file.startsWith(`assets${sep}`))
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  };
