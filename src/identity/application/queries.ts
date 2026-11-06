import { Query } from '@nestjs/cqrs';
import type { ReadScope } from '../domain/read-scope.js';

// what a user may read now (ReadScope); UnknownUserError for an id no
// user has
export class ReadScopeQuery extends Query<ReadScope> {
  constructor(public readonly userId: string) {
    super();
  }
}

// whether the user may do what only admins may, now: an admin, not banned;
// UnknownUserError for an id no user has
export class IsAdminQuery extends Query<boolean> {
  constructor(public readonly userId: string) {
    super();
  }
}
