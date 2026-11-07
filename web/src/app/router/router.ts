import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { i18n } from '@/shared/i18n';
import { parseSearch, stringifySearch } from '@/shared/lib';
import { routeTree } from '../routeTree.gen';

export function createAppRouter(
  queryClient: QueryClient,
  history?: RouterHistory,
) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    parseSearch,
    stringifySearch,
    defaultPreload: 'intent',
    // the queries hold the data; the router needn't cache it again
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  });
}

// The routes' titles are made by their heads, in the language of the time:
// run them again when the language changes. Returns what stops it.
export function followLanguage(router: ReturnType<typeof createAppRouter>) {
  const refresh = () => void router.invalidate();
  i18n.on('languageChanged', refresh);
  return () => i18n.off('languageChanged', refresh);
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
