import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// How the user signs in: a 'credential' account is an email and password,
// others are social sign-ins such as Google's
export const linkedAccountsQuery = () =>
  queryOptions({
    queryKey: ['auth', 'accounts'],
    queryFn: () => authClient.listAccounts(),
  });

export const hasPassword = (accounts: { providerId: string }[]) =>
  accounts.some((a) => a.providerId === 'credential');
