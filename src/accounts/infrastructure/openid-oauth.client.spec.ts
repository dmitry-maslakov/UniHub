import { createHash } from 'node:crypto';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Secret } from '@app/kernel';
import { OAuthRefusedError } from '../application/errors.js';
import { OpenIdOAuthClient } from './openid-oauth.client.js';

// A plain OAuth 2.0 server as Canvas is one: no discovery, no OpenID, the
// client's secret in the token request's body, and a refresh that gives no
// new refresh token.
const server = {
  issuer: 'https://lms.example.test',
  authorizationEndpoint: 'https://lms.example.test/login/oauth2/auth',
  tokenEndpoint: 'https://lms.example.test/login/oauth2/token',
  clientId: 'hub-key',
  clientSecret: new Secret('hub-secret'),
};
const redirectUri =
  'https://hub.example.test/api/me/portals/lms/oauth/callback';
const s256 = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

const asked: URLSearchParams[] = [];
const portal = setupServer(
  http.post(server.tokenEndpoint, async ({ request }) => {
    const body = new URLSearchParams(await request.text());
    asked.push(body);
    if (body.get('code') === 'used' || body.get('refresh_token') === 'gone')
      return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 });
    if (body.get('code') === 'broken')
      return HttpResponse.text('down for maintenance', { status: 503 });
    return HttpResponse.json({
      access_token:
        body.get('grant_type') === 'refresh_token' ? 'access-2' : 'access-1',
      token_type: 'Bearer',
      expires_in: 3600,
      ...(body.get('grant_type') === 'authorization_code' && {
        refresh_token: 'refresh-1',
      }),
      // Canvas names the user too: kept by no one
      user: { id: 42, name: 'Ana' },
    });
  }),
);

describe('OpenIdOAuthClient', () => {
  const client = new OpenIdOAuthClient();
  beforeAll(() => portal.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => (asked.length = 0));
  afterAll(() => portal.close());

  it('asks for consent with a state and an S256 PKCE challenge of its verifier', async () => {
    const { url, state, verifier } = await client.consent(
      { ...server, scope: 'url:GET|/api/v1/courses' },
      redirectUri,
    );
    expect(url.origin + url.pathname).toBe(server.authorizationEndpoint);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'hub-key',
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: s256(verifier),
      code_challenge_method: 'S256',
      state,
      scope: 'url:GET|/api/v1/courses',
    });
    const other = await client.consent(server, redirectUri);
    expect(other.state).not.toBe(state);
    expect(other.verifier).not.toBe(verifier);
  });

  it('trades the code for tokens with the verifier, its secret in the body, to the redirect uri the consent asked for', async () => {
    const answer = new URLSearchParams({ code: 'c-1', state: 's-1' });
    const before = Date.now();
    const tokens = await client.exchange(server, redirectUri, answer, {
      state: 's-1',
      verifier: 'v'.repeat(43),
    });

    expect([
      tokens.accessToken.reveal(),
      tokens.refreshToken?.reveal(),
    ]).toEqual(['access-1', 'refresh-1']);
    expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(
      before + 3600_000,
    );
    expect(Object.fromEntries(asked[0])).toMatchObject({
      grant_type: 'authorization_code',
      code: 'c-1',
      code_verifier: 'v'.repeat(43),
      redirect_uri: redirectUri,
      client_id: 'hub-key',
      client_secret: 'hub-secret',
    });
  });

  it('takes a consent said no to, another state, or a code refused for refused, and nothing else', async () => {
    const expected = { state: 's-1', verifier: 'v'.repeat(43) };
    for (const answer of [
      { error: 'access_denied', state: 's-1' },
      { code: 'used', state: 's-1' },
    ] as Record<string, string>[])
      await expect(
        client.exchange(
          server,
          redirectUri,
          new URLSearchParams(answer),
          expected,
        ),
      ).rejects.toThrow(OAuthRefusedError);
    const elsewhere = await client
      .exchange(
        server,
        redirectUri,
        new URLSearchParams({ code: 'c-1', state: 'not-it' }),
        expected,
      )
      .catch((e: unknown) => e);
    expect(elsewhere).toBeInstanceOf(Error);
    expect(asked).toHaveLength(1);
    await expect(
      client.exchange(
        server,
        redirectUri,
        new URLSearchParams({ code: 'broken', state: 's-1' }),
        expected,
      ),
    ).rejects.not.toThrow(OAuthRefusedError);
  });

  it('renews the access token by the refresh token, and takes one refused for refused', async () => {
    const tokens = await client.refresh(server, new Secret('refresh-1'));
    expect(tokens.accessToken.reveal()).toBe('access-2');
    expect(tokens.refreshToken).toBeNull();
    expect(Object.fromEntries(asked[0])).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
      client_secret: 'hub-secret',
    });
    await expect(client.refresh(server, new Secret('gone'))).rejects.toThrow(
      OAuthRefusedError,
    );
  });
});
