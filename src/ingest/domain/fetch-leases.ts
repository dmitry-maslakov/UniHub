// Who downloads a file's bytes for the accounts that see that version of
// them: the one run that takes its lease, while the others go on without,
// till the hub has them or the lease runs out.
export abstract class FetchLeases {
  // true for the first to ask for the key, until its lease runs out, `ms`
  // from now
  abstract take(key: string, ms: number): Promise<boolean>;
}
