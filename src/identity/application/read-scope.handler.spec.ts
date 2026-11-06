import { Ban } from '../domain/ban.js';
import { UnknownUserError } from '../domain/errors.js';
import { ADMIN_ROLE, Reader } from '../domain/reader.js';
import { InMemoryCourseAccess, InMemoryReaders } from './identity.fakes.js';
import { ReadScopeQuery } from './queries.js';
import { ReadScopeHandler } from './read-scope.handler.js';

async function scopeOf(reader: Reader) {
  const access = new InMemoryCourseAccess();
  await access.grant('ana', 'os');
  const handler = new ReadScopeHandler(
    new InMemoryReaders(new Map([['ana', reader]])),
    access,
  );
  return handler.execute(new ReadScopeQuery('ana'));
}

describe('ReadScopeQuery', () => {
  it("answers the courses granted to the user, an admin's all", async () => {
    const student = await scopeOf(new Reader([], null));
    expect([student.allows('os'), student.allows('net')]).toEqual([
      true,
      false,
    ]);
    expect((await scopeOf(new Reader([ADMIN_ROLE], null))).allows('net')).toBe(
      true,
    );
  });

  it("answers none of a banned user's, nor their own accounts", async () => {
    const banned = await scopeOf(new Reader([], new Ban(null)));
    expect([banned.allows('os'), banned.ownAccounts]).toEqual([false, false]);
  });

  it('refuses a user who does not exist', async () => {
    const handler = new ReadScopeHandler(
      new InMemoryReaders(),
      new InMemoryCourseAccess(),
    );
    await expect(
      handler.execute(new ReadScopeQuery('nobody')),
    ).rejects.toBeInstanceOf(UnknownUserError);
  });
});
