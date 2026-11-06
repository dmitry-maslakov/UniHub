import { Ban } from '../domain/ban.js';
import { UnknownUserError } from '../domain/errors.js';
import { ADMIN_ROLE, Reader } from '../domain/reader.js';
import { InMemoryReaders } from './identity.fakes.js';
import { IsAdminHandler } from './is-admin.handler.js';
import { IsAdminQuery } from './queries.js';

const handler = new IsAdminHandler(
  new InMemoryReaders(
    new Map([
      ['ana', new Reader([], null)],
      ['bo', new Reader([ADMIN_ROLE], null)],
      ['cy', new Reader([ADMIN_ROLE], new Ban(null))],
    ]),
  ),
);
const isAdmin = (userId: string) => handler.execute(new IsAdminQuery(userId));

describe('IsAdminQuery', () => {
  it('answers whether the user is an admin, and none while banned', async () => {
    expect(await isAdmin('ana')).toBe(false);
    expect(await isAdmin('bo')).toBe(true);
    expect(await isAdmin('cy')).toBe(false);
  });

  it('refuses a user who does not exist', async () => {
    await expect(isAdmin('nobody')).rejects.toBeInstanceOf(UnknownUserError);
  });
});
