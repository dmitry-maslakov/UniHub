import { redirect } from '@tanstack/react-router';
import { sessionQuery } from '@/entities/session';
import { safeNext } from '@/shared/lib';
import type { RouterContext } from './context';

interface GuardArgs {
  context: RouterContext;
  location: { href: string };
}

// The app's own pages: signed out, to sign in and back here after
export async function requireSession({ context, location }: GuardArgs) {
  const session = await context.queryClient.ensureQueryData(sessionQuery());
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
  const session = await context.queryClient.ensureQueryData(sessionQuery());
  if (session) throw redirect({ href: safeNext(search.next) });
}
