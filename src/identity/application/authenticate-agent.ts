import { Injectable } from '@nestjs/common';
import { AccessTokens, type TokenCheck } from '../domain/access-tokens.js';
import type { AgentCredential } from '../domain/agent-credential.js';
import { ApiKeys } from '../domain/api-keys.js';
import { ReaderRepository } from '../domain/reader.js';

// Whom an agent (an MCP client) calls for, by its API key or OAuth access
// token: null for one that doesn't verify, and for a banned user's, since a
// ban ends sessions but neither of these; 'insufficient-scope' for a token
// that verifies but lacks a scope MCP takes.
@Injectable()
export class AuthenticateAgent {
  constructor(
    private readonly keys: ApiKeys,
    private readonly tokens: AccessTokens,
    private readonly readers: ReaderRepository,
  ) {}

  async run(credential: AgentCredential): Promise<TokenCheck> {
    const found =
      credential.kind === 'api-key'
        ? await this.keys.verify(credential.key)
        : await this.tokens.verify(credential.request);
    if (!found || found === 'insufficient-scope') return found;
    const reader = await this.readers.findById(found.userId);
    return reader && !reader.bannedAt() ? { userId: found.userId } : null;
  }
}
