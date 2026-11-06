import type { Ban } from './ban.js';
import { ReadScope } from './read-scope.js';

// the role Better Auth's admin plugin treats as admin, and @Roles asks for
export const ADMIN_ROLE = 'admin';

// Someone who reads the hub, as far as what they may read goes. Users are
// Better Auth's (passwords, sessions, roles, bans), so no aggregate here
// guards them: this only reads them.
export class Reader {
  constructor(
    readonly roles: readonly string[],
    readonly ban: Ban | null,
  ) {}

  bannedAt(now = new Date()) {
    return this.ban?.activeAt(now) ?? false;
  }

  // may do what only admins may: an admin, and not banned
  adminAt(now = new Date()) {
    return !this.bannedAt(now) && this.roles.includes(ADMIN_ROLE);
  }

  // Admins read every course, everyone else the ones granted to them. A ban
  // ends sessions, but anything that found the user earlier (an API key)
  // must not read either.
  scope(granted: Iterable<string>, now = new Date()) {
    if (this.bannedAt(now)) return ReadScope.none();
    return this.adminAt(now) ? ReadScope.all() : ReadScope.of(granted);
  }
}

// users by id
export abstract class ReaderRepository {
  abstract findById(userId: string): Promise<Reader | null>;
}
