import type { User } from '../../generated/prisma/client.js';
import { Ban } from '../domain/ban.js';
import { Reader } from '../domain/reader.js';

// what a reader is made of, in Better Auth's user table
export const readerColumns = { role: true, banned: true, banExpires: true };

// The admin plugin keeps roles comma separated, and a ban with no expiry is
// for good.
export const toReader = (row: Pick<User, keyof typeof readerColumns>) =>
  new Reader(
    (row.role ?? '')
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean),
    row.banned ? new Ban(row.banExpires) : null,
  );
