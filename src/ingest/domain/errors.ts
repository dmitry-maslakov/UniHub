import { InvalidError } from '@app/kernel';
import type { Connection } from './connection.js';

// a record that isn't the shape the sdk describes, or a content stream out
// of order: what the sender has to fix
export class MalformedRecordError extends InvalidError {
  readonly reason = 'INVALID_RECORD';

  constructor(readonly issues: string[]) {
    super(`invalid record: ${issues.join('; ')}`);
  }
}

// a record sent, or removed, one by one for a user's own account, which
// sends what it sees by passes
export class SharedOnlyError extends InvalidError {
  readonly reason = 'SHARED_ONLY';

  constructor(connection: Connection) {
    super(
      `${connection.portal} sends a user's account's records by passes, only the shared account's one by one`,
    );
  }
}
