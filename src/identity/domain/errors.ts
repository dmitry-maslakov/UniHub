import { NotFoundError } from '@app/kernel';

export class UnknownUserError extends NotFoundError {
  readonly reason = 'UNKNOWN_USER';

  constructor(readonly userId: string) {
    super(`unknown user ${userId}`);
  }
}
