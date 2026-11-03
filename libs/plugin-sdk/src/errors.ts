// errors a plugin can get back from the hub

// a record refers to a course, item or file the plugin never sent
export class UnknownReferenceError extends Error {
  constructor(readonly externalId: string) {
    super(`unknown reference ${externalId}`);
    this.name = 'UnknownReferenceError';
  }
}

// a record doesn't match the shapes in records.ts
export class InvalidRecordError extends Error {
  constructor(readonly issues: string[]) {
    super(`invalid record: ${issues.join('; ')}`);
    this.name = 'InvalidRecordError';
  }
}
