import { useEffect } from 'react';
import { type createAppRouter, followLanguage } from '@/app/router/router';

// the app's own wiring of the language to the routes' titles, for as long
// as the app is rendered
export function FollowLanguage({
  router,
}: {
  router: ReturnType<typeof createAppRouter>;
}) {
  useEffect(() => followLanguage(router), [router]);
  return null;
}
