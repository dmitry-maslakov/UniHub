import { Query } from '@nestjs/cqrs';
import type { ReadScope } from '../domain/read-scope.js';

// the courses a user may read now; UnknownUserError for an id no user has
export class ReadScopeQuery extends Query<ReadScope> {
  constructor(public readonly userId: string) {
    super();
  }
}
