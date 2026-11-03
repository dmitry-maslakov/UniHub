// a plugin referred to something it never sent (an item before its course...)
export class UnknownReferenceError extends Error {
  constructor(
    readonly portal: string,
    readonly externalId: string,
  ) {
    super(`${portal}: unknown reference ${externalId}`);
    this.name = 'UnknownReferenceError';
  }
}
