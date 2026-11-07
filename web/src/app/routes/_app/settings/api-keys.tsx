import { createFileRoute, redirect } from '@tanstack/react-router';

// where API keys were made before Connect AI
export const Route = createFileRoute('/_app/settings/api-keys')({
  beforeLoad: () => {
    throw redirect({ to: '/connect', replace: true });
  },
});
