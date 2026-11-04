import type { Json } from '@app/plugin-sdk';
import type { Assignment, Topic } from './canvas.types.js';

// A record is the object as the whole course sees it (the sdk's
// records.ts), but Canvas answers as things stand for the token's user:
// what only some of the course see stays out, and so does what says how
// the user stands.

// Not an announcement for some sections, nor an assignment only the
// students it's assigned to have. Group discussions aren't read at all.
export const forEveryone = {
  announcement: (topic: Topic) => !topic.is_section_specific,
  assignment: (a: Assignment) =>
    !a.only_visible_to_overrides && a.visible_to_everyone !== false,
};

// The user's own state: read or not, subscribed, what they may do, locked
// for them, their submission, how far they got through a module (its
// state and completed_at, an item's completion_requirement.completed).
// Kept, they'd make a record differ from one user to the next.
const PER_USER = new Set([
  'read_state',
  'unread_count',
  'subscribed',
  'subscription_hold',
  'user_can_see_posts',
  'permissions',
  'locked_for_user',
  'lock_explanation',
  'lock_info',
  'hidden_for_user',
  'submission',
  'state',
  'completed_at',
  'completed',
]);

// a file's download link carries its verifier, a key to the file
const keyToFile = (key: string, value: unknown) =>
  (key === 'url' || key.endsWith('_url')) &&
  typeof value === 'string' &&
  /[?&]verifier=/.test(value);

// what Canvas answered, as an item's raw: everything but the above, at
// any depth
export const raw = (answer: object): Json =>
  JSON.parse(JSON.stringify(answer), (key, value: unknown) =>
    PER_USER.has(key) || keyToFile(key, value) ? undefined : value,
  ) as Json;
