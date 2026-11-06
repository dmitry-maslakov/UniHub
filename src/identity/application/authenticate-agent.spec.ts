import type { TokenCheck } from '../domain/access-tokens.js';
import type { AgentCredential } from '../domain/agent-credential.js';
import { Ban } from '../domain/ban.js';
import { Reader } from '../domain/reader.js';
import { AuthenticateAgent } from './authenticate-agent.js';
import {
  FakeAccessTokens,
  FakeApiKeys,
  InMemoryReaders,
} from './identity.fakes.js';

const hour = 60 * 60 * 1000;

const key = (key: string): AgentCredential => ({ kind: 'api-key', key });
const token = (authorization: string): AgentCredential => ({
  kind: 'access-token',
  request: {
    authorization,
    dpop: undefined,
    method: 'POST',
    url: 'https://hub.example/api/mcp',
  },
});

function authenticate(reader: Reader | null) {
  const readers = new InMemoryReaders();
  if (reader) readers.byId.set('ana', reader);
  const keys = new FakeApiKeys(
    new Map([['secret', { keyId: 'k1', userId: 'ana' }]]),
  );
  const tokens = new FakeAccessTokens(
    new Map<string, TokenCheck>([
      ['Bearer a.b.c', { userId: 'ana' }],
      ['Bearer short.of.scope', 'insufficient-scope'],
    ]),
  );
  return new AuthenticateAgent(keys, tokens, readers);
}

describe('AuthenticateAgent', () => {
  const ana = new Reader([], null);

  it("names the user of a key, or of a token, that's theirs", async () => {
    expect(await authenticate(ana).run(key('secret'))).toEqual({
      userId: 'ana',
    });
    expect(await authenticate(ana).run(token('Bearer a.b.c'))).toEqual({
      userId: 'ana',
    });
  });

  it("refuses a key or token that doesn't verify", async () => {
    expect(await authenticate(ana).run(key('guess'))).toBeNull();
    expect(await authenticate(ana).run(token('Bearer x.y.z'))).toBeNull();
  });

  it('tells a token that lacks the scope apart, for its client to ask for it', async () => {
    expect(await authenticate(ana).run(token('Bearer short.of.scope'))).toBe(
      'insufficient-scope',
    );
  });

  it("refuses a banned user's key and token, until the ban is over", async () => {
    for (const credential of [key('secret'), token('Bearer a.b.c')]) {
      const banned = (until: Date | null) =>
        authenticate(new Reader([], new Ban(until))).run(credential);
      expect(await banned(null)).toBeNull();
      expect(await banned(new Date(Date.now() + hour))).toBeNull();
      expect(await banned(new Date(Date.now() - hour))).not.toBeNull();
    }
  });

  it('refuses the key or token of a user since deleted', async () => {
    expect(await authenticate(null).run(key('secret'))).toBeNull();
    expect(await authenticate(null).run(token('Bearer a.b.c'))).toBeNull();
  });
});
