import { z } from 'zod';

// What a run keeps for the next: each page it has read or tried, by pathname
const PageState = z.object({
  // its section's id
  s: z.string(),
  // the sitemap's lastmod it was read at
  m: z.string().nullable(),
  // the day it was read, in UTC days since the epoch; 0 for a page not read
  // yet, or due again for good (a document it links lost its holder)
  d: z.number().int(),
  // the documents it holds, by pathname
  f: z.array(z.string()),
  // all the documents it links (those it holds, and those another does)
  l: z.array(z.string()).default([]),
  // its post is in the hub
  k: z.boolean().default(false),
  // how many days in a row it looked gone or wrong, not yet confirmed
  b: z.number().int().default(0),
  // the day it last failed or looked wrong: not tried again that day
  a: z.number().int().optional(),
});
export type PageState = z.infer<typeof PageState>;

const State = z.object({
  v: z.literal(1),
  pages: z.record(z.string(), PageState),
});
export type State = z.infer<typeof State>;

// a page not read yet
export const unread = (s: string): PageState => ({
  s,
  m: null,
  d: 0,
  f: [],
  l: [],
  k: false,
  b: 0,
});

// a shape that isn't this one counts as none
export const stateOf = (saved: unknown): State => {
  const parsed = State.safeParse(saved);
  return parsed.success ? parsed.data : { v: 1, pages: {} };
};
