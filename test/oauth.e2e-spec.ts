import { createHash, randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Auth } from '../src/identity/infrastructure/better-auth.js';
import type { Mail } from '../src/identity/domain/mailer.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { accounts, ORIGIN } from './accounts.js';
import { bootApp } from './app.js';

// An AI app connecting by OAuth, as claude.ai or ChatGPT does, through the
// API alone (the pages are the web app's): discovery, its metadata document
// fetched (CIMD), sign-in and consent with the signed query, the code
// exchanged for tokens, and /api/mcp with them. What Better Auth checks of
// a request (PKCE, the signed query, refresh rotation) is its own; this
// checks the hub's settings and wiring. The app listens: the hub fetches its
// own keys over loopback.

const ISSUER = `${ORIGIN}/api/auth`;
const RESOURCE = `${ORIGIN}/api/mcp`;
const CLIENT_ID = 'https://agent.example/oauth/client.json';
const REDIRECT_URI = 'https://agent.example/oauth/callback';

// the app's metadata document, at a made-up host the fake transport serves
const fetched: string[] = [];
const clientMetadata = async (input: RequestInfo | URL) => {
  const url = new Request(input).url;
  fetched.push(url);
  if (url !== CLIENT_ID) return new Response(null, { status: 404 });
  return Response.json(
    {
      client_id: CLIENT_ID,
      client_name: 'Agent',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    { headers: { 'cache-control': 'max-age=3600' } },
  );
};

const base64url = (bytes: Buffer) => bytes.toString('base64url');
const claimsOf = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as {
    [claim: string]: unknown;
  };

describe('OAuth for MCP clients', { timeout: 20_000 }, () => {
  let app: INestApplication;
  const mails: Mail[] = [];
  const { http, post, signUp, signIn, userId, ban } = accounts(
    () => app,
    mails,
  );
  const password = 'correct horse 1';

  // one JSON-RPC call to /api/mcp
  const rpc = (headers: Record<string, string>) =>
    http()
      .post('/api/mcp')
      .set('accept', 'application/json, text/event-stream')
      .set(headers)
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });

  const tokenRequest = (form: Record<string, string>) =>
    http()
      .post('/api/auth/oauth2/token')
      .type('form')
      .send({ client_id: CLIENT_ID, resource: RESOURCE, ...form });

  // The whole way an app goes, from the authorize request to its tokens:
  // the consent asked for the first time only, Better Auth remembering it
  // per app and user. `asked` says whether it was.
  async function connect(email: string) {
    const verifier = base64url(randomBytes(32));
    const authorize = await http()
      .get('/api/auth/oauth2/authorize')
      .query({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'courses:read offline_access',
        state: 'st4te',
        code_challenge: base64url(
          createHash('sha256').update(verifier).digest(),
        ),
        code_challenge_method: 'S256',
        resource: RESOURCE,
      })
      .expect(302);
    // to the web app's sign-in, with the signed query
    const login = new URL(authorize.headers.location, ORIGIN);
    expect(login.pathname).toBe('/sign-in');

    const signedIn = await post('/sign-in/email', {
      email,
      password,
      oauth_query: login.search.slice(1),
    }).expect(200);
    const cookie = (signedIn.headers['set-cookie'] as unknown as string[]).join(
      '; ',
    );
    let next = new URL(signedIn.body.url, ORIGIN);
    const asked = next.pathname === '/consent';
    if (asked)
      next = new URL(
        (
          await post(
            '/oauth2/consent',
            { accept: true, oauth_query: next.search.slice(1) },
            cookie,
          ).expect(200)
        ).body.url,
      );
    expect(next.origin + next.pathname).toBe(REDIRECT_URI);
    expect(next.searchParams.get('state')).toBe('st4te');
    expect(next.searchParams.get('iss')).toBe(ISSUER);

    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code: next.searchParams.get('code')!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }).expect(200);
    return { ...tokens.body, cookie, asked } as {
      access_token: string;
      refresh_token: string;
      scope: string;
      cookie: string;
      asked: boolean;
    };
  }

  // a JWT the hub signs as it does access tokens, with other claims
  const signed = async (claims: Record<string, unknown>) => {
    const { token } = await app
      .get<AuthService<Auth>>(AuthService)
      .api.signJWT({
        body: {
          payload: {
            iss: ISSUER,
            aud: RESOURCE,
            azp: CLIENT_ID,
            sub: await userId('ana@oauth.test'),
            scope: 'courses:read',
            ...claims,
          },
        },
      });
    return token;
  };

  beforeAll(async () => {
    app = await bootApp({ mails, clientMetadata });
    await app.listen(0);
    await signUp('ana@oauth.test', password);
  });

  afterAll(() => app.close());

  it('serves the discovery documents at the root, where clients look', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/api/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const { body } = await http().get(path).expect(200);
      expect(body).toMatchObject({
        resource: RESOURCE,
        authorization_servers: [ISSUER],
        scopes_supported: ['courses:read'],
      });
    }

    const { body } = await http()
      .get('/.well-known/oauth-authorization-server/api/auth')
      .expect(200);
    expect(body).toMatchObject({
      issuer: ISSUER,
      client_id_metadata_document_supported: true,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ['courses:read', 'offline_access'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
    });
    expect(body.token_endpoint_auth_methods_supported).toContain('none');
    // no dynamic registration
    expect(body.registration_endpoint).toBeUndefined();
    // under the api prefix, nothing
    await http().get('/api/.well-known/oauth-protected-resource').expect(404);
  });

  it('lets an app in by its metadata document, for /api/mcp alone', async () => {
    const tokens = await connect('ana@oauth.test');
    expect(tokens.asked).toBe(true);
    expect(fetched).toContain(CLIENT_ID);
    expect(tokens.scope).toBe('courses:read offline_access');
    expect(tokens.refresh_token).toEqual(expect.any(String));
    const claims = claimsOf(tokens.access_token);
    expect(claims).toMatchObject({ iss: ISSUER, azp: CLIENT_ID });
    expect([claims.aud].flat()).toContain(RESOURCE);

    await rpc({ authorization: `Bearer ${tokens.access_token}` }).expect(200);
    // asked once
    expect((await connect('ana@oauth.test')).asked).toBe(false);
  });

  it('challenges a call without a credential to sign in', async () => {
    for (const headers of [
      {} as Record<string, string>,
      { authorization: 'Bearer not.a.token' },
      {
        authorization: `Bearer ${await signed({ aud: `${ORIGIN}/api/other` })}`,
      },
    ]) {
      const res = await rpc(headers).expect(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp", scope="courses:read"`,
      );
      expect(res.body).toMatchObject({
        jsonrpc: '2.0',
        error: { code: -32000 },
        id: null,
      });
    }
  });

  it('asks for the scope a token lacks', async () => {
    const res = await rpc({
      authorization: `Bearer ${await signed({ scope: 'offline_access' })}`,
    }).expect(403);
    expect(res.headers['www-authenticate']).toContain(
      'error="insufficient_scope", scope="courses:read"',
    );
  });

  it("stops a banned user's token", async () => {
    const { access_token } = await connect('ana@oauth.test');
    await ban('ana@oauth.test');
    await rpc({ authorization: `Bearer ${access_token}` }).expect(401);
    await ban('ana@oauth.test', false);
  });

  it("ends an app's refresh tokens and consent with a new password", async () => {
    const { refresh_token, cookie } = await connect('ana@oauth.test');
    await post(
      '/change-password',
      { currentPassword: password, newPassword: 'battery staple 2' },
      cookie,
    ).expect(200);
    const refused = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token,
    }).expect(400);
    expect(refused.body.error).toBe('invalid_grant');
    expect(
      await app.get(PrismaService).oauthRefreshToken.count({
        where: { user: { email: 'ana@oauth.test' } },
      }),
    ).toBe(0);
    await post(
      '/change-password',
      { currentPassword: 'battery staple 2', newPassword: password },
      await signIn('ana@oauth.test', 'battery staple 2'),
    ).expect(200);
    // let in again, the user asked again
    expect((await connect('ana@oauth.test')).asked).toBe(true);
  });

  it('makes no client through the API, nor by dynamic registration', async () => {
    const cookie = await signIn('ana@oauth.test', password);
    const client = { redirect_uris: [REDIRECT_URI], client_name: 'Mine' };
    await post('/oauth2/create-client', client, cookie).expect(401);
    await post('/oauth2/register', client, cookie).expect(403);
    expect(
      await app.get(PrismaService).oauthClient.count({
        where: { name: 'Mine' },
      }),
    ).toBe(0);
  });

  it('takes an access token on MCP alone, and no session there', async () => {
    const { access_token } = await connect('ana@oauth.test');
    await http()
      .get('/api/courses')
      .set('authorization', `Bearer ${access_token}`)
      .expect(401);
    const signedIn = await post('/sign-in/email', {
      email: 'ana@oauth.test',
      password,
    }).expect(200);
    const session = signedIn.headers['set-auth-token'] as string;
    await http()
      .get('/api/courses')
      .set('authorization', `Bearer ${session}`)
      .expect(200);
    await rpc({ authorization: `Bearer ${session}` }).expect(401);
  });

  it("turns away another site's page", async () => {
    const res = await rpc({ origin: 'https://evil.example' }).expect(403);
    expect(res.body).toMatchObject({ jsonrpc: '2.0', id: null });
    // the hub's own pages may
    await rpc({ origin: ORIGIN }).expect(401);
  });
});
