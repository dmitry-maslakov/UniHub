import { Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import {
  createAuthMiddleware,
  freshSessionMiddleware,
  isAPIError,
} from 'better-auth/api';
import { admin, bearer, deviceAuthorization, jwt } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { createCimdClientDiscovery } from '@better-auth/cimd';
import { mcp } from '@better-auth/mcp';
import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { FRESH_AGE_SECONDS } from '../domain/fresh-session.js';
import type { Mail, Mailer } from '../domain/mailer.js';
import { ADMIN_ROLE } from '../domain/reader.js';

// our own apps that may sign in by QR code (device authorization)
export const DEVICE_CLIENTS = ['unihub-web', 'unihub-app'];

// what a session does that outlasts it: makes an API key, approves a
// screen's sign-in by QR, which gives that screen a session of its own, or
// lets an AI app in by OAuth, which keeps it in by refresh tokens
const FRESH_SESSION_PATHS = [
  '/api-key/create',
  '/device/approve',
  '/oauth2/consent',
];

// what MCP's tools take of an OAuth client: reading courses, read-only
export const MCP_SCOPES = ['courses:read'];

// /api/mcp as OAuth names it, the resource its access tokens are bound to
// (RFC 8707): exactly the URL a user gives an AI app
export const mcpResource = (baseURL: string) =>
  new URL('/api/mcp', baseURL).href;

// 90 days; the plugin reads it in seconds, whatever its docs say
export const API_KEY_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

export interface AuthDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  // headers that carry the client's address, for Better Auth's limits;
  // unset, its default
  clientIpHeaders?: string[];
  google?: { clientId: string; clientSecret: string };
  // how OAuth clients' metadata documents are fetched (CIMD)
  fetchClientMetadata: ClientMetadataResourceFetch;
  // once a user's delete has committed: what other modules keep of them goes
  onUserDeleted: (userId: string) => void;
}

const logger = new Logger('Auth');

export function createAuth({
  prisma,
  mailer,
  secret,
  baseURL,
  trustedOrigins,
  clientIpHeaders,
  google,
  fetchClientMetadata,
  onUserDeleted,
}: AuthDeps) {
  // not awaited, so how long sending takes doesn't tell whether an account
  // exists (Better Auth's advice)
  const send = (mail: Mail) =>
    void mailer
      .send(mail)
      .catch((err: unknown) =>
        logger.error(`mail to ${mail.to} failed`, err as Error),
      );

  // A new password ends what MCP clients got under the old one, API keys
  // and OAuth refresh tokens (a JWT access token ends within the hour), and
  // the consents, so an app let in has to be let in again: a stolen session,
  // or a screen signed in by QR, may have let some in, and none needs a
  // session to work. Neither plugin has a call for all of a user's; both
  // keep them in the database only (no secondaryStorage here), so this is
  // all of them.
  const dropAgentCredentials = (userId: string) =>
    prisma.$transaction([
      prisma.apikey.deleteMany({ where: { referenceId: userId } }),
      prisma.oauthRefreshToken.deleteMany({ where: { userId } }),
      prisma.oauthConsent.deleteMany({ where: { userId } }),
    ]);

  const auth = betterAuth({
    secret,
    baseURL,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // jwt()'s JWT for a session: OAuth's access tokens are the only JWTs
    // (Better Auth's MCP docs)
    disabledPaths: ['/token'],
    // Better Auth skips origin checks under NODE_ENV=test; on here, tests see
    // what production does
    advanced: {
      disableOriginCheck: false,
      ...(clientIpHeaders && {
        ipAddress: { ipAddressHeaders: clientIpHeaders },
      }),
      // work that can wait until the response is out (API key bookkeeping)
      backgroundTasks: {
        handler: (task) =>
          void task.catch((err: unknown) =>
            logger.error('background task failed', err as Error),
          ),
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      // a stolen session, or a screen signed in by QR, ends with a reset
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }) => {
        await dropAgentCredentials(user.id);
      },
      sendResetPassword: async ({ user, url }) =>
        send({
          to: user.email,
          subject: 'Reset your UniHub password',
          text: `To set a new password, open ${url}`,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        send({
          to: user.email,
          subject: 'Confirm your email for UniHub',
          text: `To confirm your email, open ${url}`,
        }),
    },
    socialProviders: google ? { google } : {},
    // Better Auth's default, set here as the hub's routes check the same
    // (FreshSession)
    session: { freshAge: FRESH_AGE_SECONDS },
    // run once the delete has committed (Better Auth queues them after its
    // transaction), so nothing goes for a user still there
    databaseHooks: {
      user: { delete: { after: async (user) => onUserDeleted(user.id) } },
    },
    hooks: {
      // A key outlives the session that made it, a screen approved by QR
      // gets a session of its own, new and so fresh, and an AI app let in
      // keeps refreshing its tokens. So only a session signed in within a
      // day (freshAge, fresh-session.ts) does any of them: an
      // old cookie someone stole doesn't, nor does a session kept alive for
      // weeks. Before hooks all get the request as it came, before bearer()
      // turns a token into the cookie, so the session is read through
      // auth.api, which runs bearer() first, and left where the middleware
      // and the endpoint look for it.
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.headers || !FRESH_SESSION_PATHS.includes(ctx.path)) return;
        ctx.context.session = await auth.api.getSession({
          headers: ctx.headers,
          query: { disableRefresh: true },
        });
        await freshSessionMiddleware(ctx);
      }),
      // the other ways to a new password: the user's own change, an admin's
      after: createAuthMiddleware(async (ctx) => {
        if (isAPIError(ctx.context.returned)) return;
        const userId =
          ctx.path === '/change-password'
            ? ctx.context.session?.user.id
            : ctx.path === '/admin/set-user-password'
              ? (ctx.body as { userId?: string }).userId
              : undefined;
        if (userId) await dropAgentCredentials(userId);
      }),
    },
    plugins: [
      // user roles: an admin decides who reads which course
      admin({ adminRoles: [ADMIN_ROLE] }),
      // a session token in Authorization, for apps and API clients without
      // cookies, and for the token device sign-in hands out
      bearer(),
      // sign in by QR: a new screen shows a code, a signed-in phone approves it
      deviceAuthorization({
        validateClient: (clientId) => DEVICE_CLIENTS.includes(clientId),
        // the web app's approve page, on the hub's own origin
        verificationUri: '/device',
      }),
      // for MCP clients. The plugin's limit only resets after a quiet
      // window, so a steadily working agent gets locked out; MCP routes
      // throttle per user instead
      // a key's last use is written after the answer, not before it.
      // Keys expire; clients can't pick their own expiry, since
      // /api-key/update with expiresIn: null would make a key permanent
      apiKey({
        rateLimit: { enabled: false },
        deferUpdates: true,
        keyExpiration: {
          defaultExpiresIn: API_KEY_LIFETIME_SECONDS,
          disableCustomExpiresTime: true,
        },
      }),
      // signs OAuth access tokens, its keys at /api/auth/jwks; no JWT in a
      // session's headers either (Better Auth's MCP docs)
      jwt({ disableSettingJwtHeader: true }),
      // MCP clients (claude.ai, Claude Desktop and Code, ChatGPT) by OAuth
      // 2.1: a user signs in on the web app's /sign-in and lets the app in
      // on its /consent, and the app gets a JWT access token for /api/mcp
      // alone (1 hour) and a refresh token, replaced on every use (30 days).
      // Its issuer is /api/auth, its discovery documents are served at the
      // root (WellKnownController). No openid: no ID tokens or UserInfo
      mcp({
        resource: mcpResource(baseURL),
        scopes: [...MCP_SCOPES, 'offline_access'],
        // its row, which the provider writes on the first request, with its
        // scopes named: Prisma takes no null for a list
        resources: [
          {
            identifier: mcpResource(baseURL),
            allowedScopes: [...MCP_SCOPES, 'offline_access'],
          },
        ],
        // no client_credentials: every token is a user's
        grantTypes: ['authorization_code', 'refresh_token'],
        loginPage: '/sign-in',
        consentPage: '/consent',
        // no client is made, read or changed through the API, by anyone
        // signed in (the provider's default): apps come by CIMD alone,
        // which registers them without this check
        clientPrivileges: () => false,
        // per address and path: Claude's and ChatGPT's backends refresh all
        // their users' tokens from a few addresses
        rateLimit: { token: { window: 60, max: 300 } },
        // An app registers by its Client ID Metadata Document alone: its
        // client_id is the https URL of it, fetched when it first comes and
        // again after an hour. No dynamic registration, which would make a
        // client per connection anyone may ask for. Given to the provider
        // here, the way @better-auth/cimd documents beside its cimd()
        // plugin: the plugin hands the provider a new extension each time it
        // starts, which the provider refuses as a second CIMD when the CLI
        // starts the auth again from its options
        extensions: [
          {
            clientDiscovery: createCimdClientDiscovery({
              fetchClientMetadataResource: fetchClientMetadata,
              metadataProfile: 'mcp-2026-07-28',
            }),
          },
        ],
      }),
    ],
  });
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;
