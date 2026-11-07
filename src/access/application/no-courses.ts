import type { PortalView } from '../../accounts/contracts.js';

type Source = Pick<PortalView, 'label' | 'linked' | 'picked' | 'firstSync'>;

// Why a user reads no course, in words an agent can pass on (MCP's
// list_courses): an account of theirs just linked and being read for the
// first time, or no source of their own yet (no account linked, no course
// picked) and where to connect one. Null for anything else (an account
// expired, a grant taken back): nothing the agent should guess at.
export function noCoursesNote(
  sources: readonly Source[],
  sourcesUrl: string,
): string | null {
  const syncing = sources.find((source) => source.firstSync);
  if (syncing)
    return `No courses yet: the user's ${syncing.label} account was just linked and is being read for the first time. Ask again in a few minutes.`;
  const own = sources.some((source) => source.linked || !!source.picked);
  if (!own)
    return `No courses: the user hasn't connected a source yet. They can at ${sourcesUrl}.`;
  return null;
}
