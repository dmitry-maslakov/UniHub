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

export class RemovalNotAllowedError extends InvalidError {
  readonly reason = 'REMOVAL_NOT_ALLOWED';

  constructor(connection: Connection) {
    super(`${connection.key} can't remove records, only shared accounts can`);
  }
}
