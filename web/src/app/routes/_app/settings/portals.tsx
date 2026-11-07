import { createFileRoute, redirect } from '@tanstack/react-router';

// where portal accounts were linked before Sources
export const Route = createFileRoute('/_app/settings/portals')({
  beforeLoad: () => {
    throw redirect({ to: '/sources', replace: true });
  },
});
