import { Resolver } from 'node:dns/promises';

// Canvas that Instructure hosts, whose API policy lets an app use a token
// by OAuth alone, never one a user pastes (README, Canvas tokens): a host
// under instructure.com, or a school's own name that leads there by its
// DNS CNAMEs.
const HOSTED = /(?:^|\.)instructure\.com$/;
// a name with no CNAME, or no name at all: the chain ends there
const ENDS = new Set(['ENODATA', 'ENOTFOUND']);
// a chain longer than this leads nowhere a request would get to either
const MAX_CNAMES = 8;

export type ResolveCname = (host: string) => Promise<string[]>;

const resolver = new Resolver({ timeout: 5_000, tries: 2 });
const cnameOf: ResolveCname = (host) => resolver.resolveCname(host);

// Whether Instructure hosts the Canvas at `instance`, following its CNAMEs
// one by one. A lookup that fails for another reason than the chain ending
// fails this, as a Canvas that can't be reached.
export async function hostedByInstructure(
  instance: string,
  resolveCname: ResolveCname = cnameOf,
) {
  let host = new URL(instance).hostname;
  for (let hop = 0; hop <= MAX_CNAMES; hop++) {
    if (HOSTED.test(host)) return true;
    try {
      const [next] = await resolveCname(host);
      if (!next) return false;
      host = next.toLowerCase().replace(/\.$/, '');
    } catch (error) {
      if (ENDS.has((error as NodeJS.ErrnoException).code ?? '')) return false;
      throw error;
    }
  }
  return false;
}
