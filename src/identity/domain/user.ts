export interface User {
  id: string;
  // Better Auth's admin plugin keeps roles comma separated
  roles: string[];
  // until when the user is banned; null when they aren't
  bannedUntil: Date | null;
}

// the role Better Auth's admin plugin treats as admin, and @Roles asks for
export const ADMIN_ROLE = 'admin';

export const isAdmin = (user: User) => user.roles.includes(ADMIN_ROLE);

export const isBanned = (user: User, now = new Date()) =>
  user.bannedUntil !== null && user.bannedUntil > now;

// users themselves are Better Auth's; this only reads them
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
}
