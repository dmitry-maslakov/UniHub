// published only when something actually changed, not on every resend

export class ItemIngestedEvent {
  constructor(
    public readonly portal: string,
    public readonly itemId: string,
  ) {}
}

export class FileContentStoredEvent {
  constructor(
    public readonly portal: string,
    public readonly fileId: string,
    public readonly hash: string,
  ) {}
}
