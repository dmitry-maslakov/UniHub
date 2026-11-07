import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';
import { authClient } from '@/shared/api';
import { appHost } from '../lib/app-host';

const consentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  createdAt: z.coerce.date(),
});

// The AI apps the user let in, newest first, each by the name it gives
// itself (its metadata document's) and its host. Its logo is never loaded.
export const connectedAppsQuery = () =>
  queryOptions({
    queryKey: ['auth', 'connected-apps'],
    queryFn: async () => {
      const consents = z
        .array(consentSchema)
        .parse(await authClient.oauth2.getConsents());
      return Promise.all(
        consents
          .toSorted((a, b) => +b.createdAt - +a.createdAt)
          .map(async (c) => ({
            id: c.id,
            host: appHost(c.clientId),
            name: await authClient.oauth2
              .publicClient({ query: { client_id: c.clientId } })
              .then(
                (client) => client.client_name ?? null,
                () => null,
              ),
            connectedAt: c.createdAt,
          })),
      );
    },
  });
