import { z } from 'zod';

// What a run keeps for the next: each page it has read, by pathname
const PageState = z.object({
  // its section's id
  s: z.string(),
  // the sitemap's lastmod it was read at
  m: z.string().nullable(),
  // the day it was read, in UTC days since the epoch
  d: z.number().int(),
  // the documents it holds, by pathname
  f: z.array(z.string()),
});
export type PageState = z.infer<typeof PageState>;

const State = z.object({
  v: z.literal(1),
  pages: z.record(z.string(), PageState),
});
export type State = z.infer<typeof State>;

// a shape that isn't this one counts as none
export const stateOf = (saved: unknown): State => {
  const parsed = State.safeParse(saved);
  return parsed.success ? parsed.data : { v: 1, pages: {} };
};
