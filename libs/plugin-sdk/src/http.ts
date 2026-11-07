import type { CreateAxiosDefaults } from 'axios';
import {
  RequestFilteringHttpAgent,
  RequestFilteringHttpsAgent,
  type RequestFilteringAgentOptions,
} from 'request-filtering-agent';

// The most a portal's answer may be, a file's content aside: the hub caps
// that as it stores it (STORAGE_MAX_FILE_MB), and stops reading there.
export const MAX_ANSWER_BYTES = 64 * 1024 * 1024;
// a chain of redirects longer than this is no portal's
const MAX_REDIRECTS = 5;

// What every request a portal plugin makes goes through, at every hop:
// agents that check the address each connection goes to once its name is
// looked up, and refuse one that isn't public (private, loopback,
// link-local, a cluster's), so neither an address a user typed, nor a
// redirect, nor a name that looks up elsewhere the second time (DNS
// rebinding) reaches the hub's own network; no proxy from the environment,
// which would make the connections in their place; and caps on redirects
// and on an answer's size. Axios's options, as plugins make requests with
// it. `filter` is for this file's spec, which needs one address let in.
export const guarded = (filter: RequestFilteringAgentOptions = {}) =>
  ({
    httpAgent: new RequestFilteringHttpAgent({ keepAlive: true, ...filter }),
    httpsAgent: new RequestFilteringHttpsAgent({ keepAlive: true, ...filter }),
    proxy: false,
    maxRedirects: MAX_REDIRECTS,
    maxContentLength: MAX_ANSWER_BYTES,
  }) satisfies CreateAxiosDefaults;

// the same agents for every portal request, whoever gave its address: a
// user or the plugin's settings
export const portalRequests = guarded();

// how the agents say they refused an address
const REFUSED = /^DNS lookup .+ is not allowed\b/;

// Whether a request failed as the guard refused where it went, its error
// or what caused it: no answer came, and none would on a retry.
export function refusedByGuard(error: unknown) {
  for (let at = error; at instanceof Error; at = at.cause)
    if (REFUSED.test(at.message)) return true;
  return false;
}
