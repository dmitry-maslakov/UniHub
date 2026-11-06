import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { identityConfig } from '../identity.config.js';
import { mcpResource } from './better-auth.js';

type Settings = ConfigType<typeof identityConfig>;

// /api/mcp as OAuth names it: what access tokens are bound to, and what a
// 401's challenge points clients at
export class McpResource {
  constructor(readonly url: string) {}
}

// The hostnames of the sites whose pages may call the hub: its own
// (BETTER_AUTH_URL) and TRUSTED_ORIGINS'. MCP turns away any other Origin
// (access's McpRequestMiddleware), against DNS rebinding.
export class TrustedOrigins {
  constructor(readonly hostnames: string[]) {}
}

export const mcpSettings: Provider[] = [
  {
    provide: McpResource,
    inject: [identityConfig.KEY],
    useFactory: ({ baseURL }: Settings) =>
      new McpResource(mcpResource(baseURL)),
  },
  {
    provide: TrustedOrigins,
    inject: [identityConfig.KEY],
    useFactory: ({ baseURL, trustedOrigins }: Settings) =>
      new TrustedOrigins([
        ...new Set(
          [baseURL, ...trustedOrigins].map(
            (origin) => new URL(origin).hostname,
          ),
        ),
      ]),
  },
];
