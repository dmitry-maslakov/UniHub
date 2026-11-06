import { join } from 'node:path';
import { cacheControl, PAGE_CSP } from './page-headers.js';

describe('the web app pages', () => {
  it('load only what comes from the hub itself, and post no forms', () => {
    const csp = new Map(
      PAGE_CSP.split('; ').map((d) => {
        const [name, ...sources] = d.split(' ');
        return [name, sources];
      }),
    );
    expect(csp.get('default-src')).toEqual(["'none'"]);
    for (const name of ['script-src', 'connect-src', 'img-src', 'font-src'])
      expect(csp.get(name)).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'none'"]);
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'none'"]);
  });

  it('are asked for anew, their hashed assets kept for good', () => {
    expect(cacheControl('index.html')).toBe('no-store');
    expect(cacheControl(join('assets', 'index-B9x2.js'))).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(cacheControl('favicon.svg')).toBe('no-cache');
  });
});
