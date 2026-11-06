import { api } from '@/shared/api';

// the hub's settings, which change only with a restart
export const useSignInMethods = () =>
  api.useQuery('get', '/api/sign-in-methods', {}, { staleTime: Infinity });
