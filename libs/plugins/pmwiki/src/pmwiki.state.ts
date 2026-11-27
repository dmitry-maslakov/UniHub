import { z } from 'zod';

// What a run keeps for the next. Pages are known by their address.

const WikiState = z.object({
  // its title, as its pages last said
  title: z.string(),
  // its page of courses, once its list of pages was read (null for none);
  // left out, to be looked for
  index: z.string().nullable().optional(),
  // what the index's last change said when it was read, and the day; 0 for
  // not yet
  m: z.string().nullable(),
  d: z.number().int(),
  // the day a page its index links couldn't be told: the index is read
  // again the next day
  a: z.number().int().optional(),
  // what the index links: the course page each is (its own address), or
  // null for one that's no page of the listed wikis
  links: z.record(z.string(), z.string().nullable()),
  // the courses it lists: each page's address, and what it says of it
  courses: z.record(z.string(), z.string()),
});
export type WikiState = z.infer<typeof WikiState>;

const CourseState = z.object({
  // what its page's last change said when it was read, and the day; 0 for
  // not yet, or due again (a download left for the next run)
  m: z.string().nullable(),
  d: z.number().int(),
  // the day it last failed: not tried again that day
  a: z.number().int().optional(),
  // the files its view holds, by their ids
  f: z.array(z.string()),
});
export type CourseState = z.infer<typeof CourseState>;

const State = z.object({
  v: z.literal(1),
  wikis: z.record(z.string(), WikiState),
  // by the course's id
  courses: z.record(z.string(), CourseState),
});
export type State = z.infer<typeof State>;

// a shape that isn't this one counts as none
export const stateOf = (saved: unknown): State => {
  const parsed = State.safeParse(saved);
  return parsed.success ? parsed.data : { v: 1, wikis: {}, courses: {} };
};
