import { Injectable } from '@nestjs/common';
import * as client from 'openid-client';
import type { OAuthServer } from '@app/plugin-sdk';
import { Secret } from '@app/kernel';
import { OAuthRefusedError } from '../application/errors.js';
import { OAuthClient, type OAuthTokens } from '../application/oauth.js';

// The portal's server as openid-client takes a plain OAuth 2.0 one (no
// OpenID Connect, no discovery): its endpoints as the connector gives them,
// the hub's client authenticating in the request's body, as Canvas asks
const configOf = (server: OAuthServer) =>
  new client.Configuration(
    {
      issuer: server.issuer,
      authorization_endpoint: server.authorizationEndpoint,
      token_endpoint: server.tokenEndpoint,
    },
    server.clientId,
    undefined,
    client.ClientSecretPost(server.clientSecret.reveal()),
  );

const tokensOf = (answer: client.TokenEndpointResponse): OAuthTokens => ({
  accessToken: new Secret(answer.access_token),
  refreshToken: answer.refresh_token ? new Secret(answer.refresh_token) : null,
  expiresAt:
    answer.expires_in === undefined
      ? null
      : new Date(Date.now() + answer.expires_in * 1000),
});

// the portal's "no": a consent denied, a code or a refresh token refused;
// anything else is it being away, or answering what the standard doesn't
const refusedOr = (error: unknown) =>
  error instanceof client.AuthorizationResponseError ||
  (error instanceof client.ResponseBodyError && error.error === 'invalid_grant')
    ? new OAuthRefusedError()
    : error;

// OAuth 2.0's authorization code with PKCE (S256) and refresh, by
// openid-client, which checks the state and the answers as the standard
// says.
@Injectable()
export class OpenIdOAuthClient extends OAuthClient {
  async consent(server: OAuthServer, redirectUri: string) {
    const verifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const url = client.buildAuthorizationUrl(configOf(server), {
      redirect_uri: redirectUri,
      code_challenge: await client.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      ...(server.scope && { scope: server.scope }),
    });
    return { url, state, verifier };
  }

  // The callback as the portal sent the user to it: the redirect uri the
  // consent asked for, with the portal's answer, whatever address the
  // request reached the app by behind a proxy
  async exchange(
    server: OAuthServer,
    redirectUri: string,
    answer: URLSearchParams,
    { state, verifier }: { state: string; verifier: string },
  ) {
    const callback = new URL(redirectUri);
    callback.search = answer.toString();
    try {
      return tokensOf(
        await client.authorizationCodeGrant(configOf(server), callback, {
          pkceCodeVerifier: verifier,
          expectedState: state,
        }),
      );
    } catch (error) {
      throw refusedOr(error);
    }
  }

  async refresh(server: OAuthServer, refreshToken: Secret) {
    try {
      return tokensOf(
        await client.refreshTokenGrant(configOf(server), refreshToken.reveal()),
      );
    } catch (error) {
      throw refusedOr(error);
    }
  }
}
