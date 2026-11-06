import { join } from 'node:path';
import type { ServerResponse } from 'node:http';
import { PAGE_CSP, pageHeaders } from './page-headers.js';

const root = join('/srv', 'web');
// the headers serve-static's setHeaders gives a file of the build
const headersOf = (...path: string[]) => {
  const set = new Map<string, string>();
  const res = {
    setHeader: (name: string, value: string) => set.set(name, value),
  };
  pageHeaders(root)(res as unknown as ServerResponse, join(root, ...path));
  return Object.fromEntries(set);
};

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

  it('are asked for anew, under that CSP', () => {
    expect(headersOf('index.html')).toEqual({
      'Content-Security-Policy': PAGE_CSP,
      'Cache-Control': 'no-store',
    });
  });

  it("keep hashed assets for good, and leave other files' headers be", () => {
    expect(headersOf('assets', 'index-B9x2.js')).toEqual({
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    expect(headersOf('favicon.svg')).toEqual({});
  });
});
