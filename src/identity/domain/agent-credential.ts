// An HTTP request with an OAuth access token, as much of it as checking the
// token takes: a DPoP-bound one is bound to the method and URL too (RFC 9449)
export interface TokenRequest {
  authorization: string;
  dpop: string | undefined;
  method: string;
  url: string;
}

// what an agent (an MCP client) signs in with: an API key the hub made, or
// an OAuth access token it issued
export type AgentCredential =
  | { kind: 'api-key'; key: string }
  | { kind: 'access-token'; request: TokenRequest };

// a request as it comes, any of its headers missing
export interface AgentRequest extends Omit<TokenRequest, 'authorization'> {
  apiKey: string | undefined;
  authorization: string | undefined;
}

const SCHEME = /^(Bearer|DPoP) +(\S+)$/i;

// Which credential a request carries, if any. X-API-Key is a key. In
// Authorization, a token of three dot-separated parts is an access token (a
// JWT), as Bearer or DPoP; anything else as Bearer is a key, as clients have
// sent keys all along (64 letters, never a dot).
export function agentCredential({
  apiKey,
  authorization,
  ...request
}: AgentRequest): AgentCredential | null {
  if (apiKey) return { kind: 'api-key', key: apiKey };
  const [, scheme, token] = SCHEME.exec(authorization ?? '') ?? [];
  if (!authorization || !token) return null;
  if (token.split('.').length === 3)
    return { kind: 'access-token', request: { ...request, authorization } };
  return scheme.toLowerCase() === 'bearer'
    ? { kind: 'api-key', key: token }
    : null;
}
