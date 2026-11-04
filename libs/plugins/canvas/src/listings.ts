import { z } from 'zod';

// What a course's listings had, to tell what is gone from Canvas. A source
// is one listing ('pages'), or what the modules link to ('module-pages'):
// the ids of what it sent, as of the last run it went through to the end.
// A source that failed, was cut short or refused keeps what it had, and
// an id is gone only once no source has it, so a tab hidden since, or a
// page out of the list but still in a module, removes nothing.

const Sources = z.record(z.string(), z.array(z.string()));
type Sources = z.output<typeof Sources>;

export const Listings = z.object({ items: Sources, files: Sources });
export type Listings = z.output<typeof Listings>;

// What the connector saves between runs, by course id; none at first. A
// new object each time: a run fills it in.
export const SyncState = z
  .object({ courses: z.record(z.string(), Listings) })
  .catch(() => ({ courses: {} }));
export type SyncState = z.output<typeof SyncState>;

function settleSources(last: Sources = {}, now: Sources) {
  const sources = { ...last, ...now };
  const kept = new Set(Object.values(sources).flat());
  const had = new Set(Object.values(last).flat());
  return { sources, gone: [...had].filter((id) => !kept.has(id)) };
}

// the listings to save once a course's run is through, and the ids gone
export function settle(last: Listings | undefined, now: Listings) {
  const items = settleSources(last?.items, now.items);
  const files = settleSources(last?.files, now.files);
  return {
    listings: { items: items.sources, files: files.sources },
    gone: { items: items.gone, files: files.gone },
  };
}
