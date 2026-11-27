import { z } from 'zod';
import { settings } from '@app/plugin-sdk';

const unset = (v: unknown) => (v === '' ? undefined : v);

// A wiki's address, as its pages' addresses start: https, a DNS name, no
// port, user, query or fragment, ending in a slash
// (https://faculty.example.edu/wiki/), or in the script that serves it,
// left as it is (https://faculty.example.edu/wiki/pmwiki.php, its pages
// ?n=Group.Name of it).
const Wiki = z
  .url({ protocol: /^https$/, hostname: z.regexes.domain })
  .transform((value, ctx) => {
    const url = new URL(value);
    if (url.port || url.username || url.password || url.search || url.hash) {
      ctx.issues.push({
        code: 'custom',
        message: 'an https address with no port, user, query or fragment',
        input: value,
      });
      return z.NEVER;
    }
    if (!/(?:\/|\.php)$/.test(url.pathname)) url.pathname += '/';
    return url.href;
  });

const Wikis = z
  .string()
  .transform((list) => list.split(/[\s,]+/).filter(Boolean))
  .pipe(z.array(Wiki).min(1))
  .refine((all) => new Set(all).size === all.length, {
    message: 'a wiki is listed twice',
  });

export const pmwikiSettings = z
  .object({
    // the wikis to read, comma or space apart: each one's address
    PMWIKI_WIKIS: Wikis,
    // names neither the hub nor whoever runs it
    PMWIKI_USER_AGENT: z.string().min(1).default('course-sync'),
    // between any two requests to a site
    PMWIKI_DELAY_MS: z.preprocess(
      unset,
      z.coerce.number().int().min(0).default(1000),
    ),
    // per run and site; the next run goes on from what this left
    PMWIKI_MAX_REQUESTS: z.preprocess(
      unset,
      z.coerce.number().int().positive().default(900),
    ),
    // a course is read again after this many days, its page changed or not,
    // so a file replaced under its name is seen
    PMWIKI_REVISIT_DAYS: z.preprocess(
      unset,
      z.coerce.number().int().positive().default(7),
    ),
  })
  .transform((env) => ({
    wikis: env.PMWIKI_WIKIS,
    userAgent: env.PMWIKI_USER_AGENT,
    delayMs: env.PMWIKI_DELAY_MS,
    maxRequests: env.PMWIKI_MAX_REQUESTS,
    revisitDays: env.PMWIKI_REVISIT_DAYS,
  }));

// read once the plugin is on
export const pmwikiConfig = settings('pmwiki', pmwikiSettings);
