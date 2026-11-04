import { NotFoundError } from '@app/kernel';

export class UnknownUserError extends NotFoundError {
  constructor(readonly userId: string) {
    super(`unknown user ${userId}`);
  }
}
