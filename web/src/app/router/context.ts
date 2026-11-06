import type { QueryClient } from '@tanstack/react-query';

// what every route's loaders and guards get
export interface RouterContext {
  queryClient: QueryClient;
}
