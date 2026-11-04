import { z } from 'zod';
import { PortalId } from '@app/kernel';
import { list, settings } from '../platform/config/settings.js';

// "acs=token1, teams=token2": the token decides the portal, so a connector
// can't write as another one. Several tokens per portal let one be rotated.
const tokens = list.transform((pairs, ctx) => {
  const byToken = new Map<string, PortalId>();
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    const portal = at < 0 ? '' : pair.slice(0, at).trim();
    const token = pair.slice(at + 1).trim();
    if (!PortalId.isValid(portal) || token.length < 16 || byToken.has(token)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'portal=token pairs: portal ids are lower-case letters, digits and dashes, tokens are unique and at least 16 characters',
      });
      return z.NEVER;
    }
    byToken.set(token, PortalId.parse(portal));
  }
  return byToken as ReadonlyMap<string, PortalId>;
});

export const ingestSettings = z
  .object({
    // external connectors connect here over gRPC, which has no TLS of its
    // own: keep it on a private network or behind a TLS proxy
    GRPC_URL: z.string().default('127.0.0.1:50051'),
    // until connectors get real credentials (#33); no tokens, no gRPC
    CONNECTOR_TOKENS: tokens,
  })
  .transform((env) => ({
    grpcUrl: env.GRPC_URL,
    tokens: env.CONNECTOR_TOKENS,
  }));

export const ingestConfig = settings('ingest', ingestSettings);
