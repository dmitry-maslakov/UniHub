import { Ban } from '../domain/ban.js';
import { Reader } from '../domain/reader.js';
import { AuthenticateApiKey } from './authenticate-api-key.js';
import { FakeApiKeys, InMemoryReaders } from './identity.fakes.js';

const hour = 60 * 60 * 1000;

function authenticate(reader: Reader | null) {
  const readers = new InMemoryReaders();
  if (reader) readers.byId.set('ana', reader);
  const keys = new FakeApiKeys(
    new Map([['secret', { keyId: 'k1', userId: 'ana' }]]),
  );
  return new AuthenticateApiKey(keys, readers);
}

describe('AuthenticateApiKey', () => {
  it('names the key and its user', async () => {
    expect(await authenticate(new Reader([], null)).run('secret')).toEqual({
      keyId: 'k1',
      userId: 'ana',
    });
  });

  it("refuses a key that doesn't verify", async () => {
    expect(await authenticate(new Reader([], null)).run('guess')).toBeNull();
  });

  it("refuses a banned user's key, until the ban is over", async () => {
    const banned = (until: Date | null) =>
      authenticate(new Reader([], new Ban(until))).run('secret');
    expect(await banned(null)).toBeNull();
    expect(await banned(new Date(Date.now() + hour))).toBeNull();
    expect(await banned(new Date(Date.now() - hour))).not.toBeNull();
  });

  it('refuses the key of a user since deleted', async () => {
    expect(await authenticate(null).run('secret')).toBeNull();
  });
});
