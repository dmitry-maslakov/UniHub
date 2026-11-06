import { agentCredential, type AgentRequest } from './agent-credential.js';

const KEY = 'aBcD'.repeat(16);
const JWT = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJhbmEifQ.c2ln';

const request = (headers: Partial<AgentRequest>): AgentRequest => ({
  apiKey: undefined,
  authorization: undefined,
  dpop: undefined,
  method: 'POST',
  url: 'https://hub.example/api/mcp',
  ...headers,
});

describe('an agent credential', () => {
  it('is a key in X-API-Key, whatever Authorization says', () => {
    expect(
      agentCredential(request({ apiKey: KEY, authorization: `Bearer ${JWT}` })),
    ).toEqual({ kind: 'api-key', key: KEY });
  });

  it('is a key as a Bearer token with no dots, as keys were always sent', () => {
    for (const authorization of [`Bearer ${KEY}`, `bearer ${KEY}`])
      expect(agentCredential(request({ authorization }))).toEqual({
        kind: 'api-key',
        key: KEY,
      });
  });

  it('is an access token in three dot-separated parts, with what binds it', () => {
    for (const authorization of [`Bearer ${JWT}`, `DPoP ${JWT}`])
      expect(
        agentCredential(request({ authorization, dpop: 'proof' })),
      ).toEqual({
        kind: 'access-token',
        request: {
          authorization,
          dpop: 'proof',
          method: 'POST',
          url: 'https://hub.example/api/mcp',
        },
      });
  });

  it('is none without a scheme it knows, or a key sent as DPoP', () => {
    for (const authorization of [
      undefined,
      '',
      KEY,
      `Basic ${KEY}`,
      `DPoP ${KEY}`,
      'Bearer ',
      `Bearer ${KEY} ${KEY}`,
    ])
      expect(agentCredential(request({ authorization }))).toBeNull();
  });
});
