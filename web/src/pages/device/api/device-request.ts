import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// The screen's request as Better Auth has it. Read while signed in, it's
// the user's to approve or deny from then on (Better Auth's verify step).
export const deviceRequest = (code: string) =>
  queryOptions({
    queryKey: ['device', code],
    queryFn: () => authClient.device({ query: { user_code: code } }),
    retry: false,
  });
