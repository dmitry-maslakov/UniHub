// Better Auth's ban: until a time, or for good when it names none
export class Ban {
  constructor(readonly until: Date | null) {}

  activeAt(now: Date) {
    return this.until === null || this.until > now;
  }
}
