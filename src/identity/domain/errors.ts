export class UnknownUserError extends Error {
  constructor(readonly userId: string) {
    super(`unknown user ${userId}`);
    this.name = 'UnknownUserError';
  }
}
