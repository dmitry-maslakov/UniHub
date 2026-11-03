export interface User {
  id: string;
  // Better Auth's admin plugin keeps roles comma separated
  roles: string[];
}

export const isAdmin = (user: User) => user.roles.includes('admin');

// users themselves are Better Auth's; this only reads them
export abstract class UserRepository {
  abstract findById(id: string): Promise<User | null>;
}
