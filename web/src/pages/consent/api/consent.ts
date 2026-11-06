import { queryOptions } from '@tanstack/react-query';
import { authClient } from '@/shared/api';

// What the app calls itself (client_name): shown small, as its own word, never
// as who is asking. Its logo_uri is never loaded: the page loads nothing
// from another site.
export const publicClient = (clientId: string) =>
  queryOptions({
    queryKey: ['oauth-client', clientId],
    queryFn: async () => {
      const client = await authClient.oauth2.publicClient({
        query: { client_id: clientId },
      });
      return { name: client.client_name };
    },
    retry: false,
  });

// The answer to the request, which Better Auth reads from the signed query
// (`oauthQuery`: the address' query without its "?"), and the address to go on to
export const answerConsent = async (accept: boolean, oauthQuery: string) => {
  const { url } = await authClient.oauth2.consent({
    accept,
    oauth_query: oauthQuery,
  });
  return url;
};
