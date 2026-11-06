import { redirect } from '@tanstack/react-router';
import { sessionQuery } from '@/entities/session';
import { safeNext } from '@/shared/lib';
import type { RouterContext } from './context';

interface GuardArgs {
  context: RouterContext;
  location: { href: string };
}

// the session as the cache has it while fresh, asked for anew once stale,
// so a session that ended since isn't taken for a live one
const currentSession = ({ queryClient }: RouterContext) =>
  queryClient.fetchQuery(sessionQuery());

// The app's own pages: signed out, to sign in and back here after
export async function requireSession({ context, location }: GuardArgs) {
  const session = await currentSession(context);
  if (!session)
    throw redirect({ to: '/sign-in', search: { next: location.href } });
}

// Sign-in and sign-up, already signed in: on to where they'd lead. Not for
// an OAuth client's sign-in (its signed query has sig): Better Auth asked
// for it, and takes it from there.
export async function skipIfSignedIn({
  context,
  search,
}: GuardArgs & { search: { next?: string; sig?: unknown } }) {
  if (search.sig) return;
  const session = await currentSession(context);
  if (session) throw redirect({ href: safeNext(search.next) });
}
