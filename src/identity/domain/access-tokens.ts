import type { TokenRequest } from './agent-credential.js';

// what checking an access token found: the user it was issued to; null for
// one that doesn't verify (forged, expired, for another resource); or one
// that verifies but lacks a scope MCP takes, whose client is to ask for it
export type TokenCheck = { userId: string } | null | 'insufficient-scope';

// OAuth access tokens the hub issued MCP clients; Better Auth issues them
export abstract class AccessTokens {
  abstract verify(request: TokenRequest): Promise<TokenCheck>;
}
