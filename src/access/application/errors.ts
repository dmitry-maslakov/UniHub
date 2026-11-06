import { NotFoundError } from '@app/kernel';

// what a user asked for and can't read: gone, never there, or not theirs,
// one answer for all three
export class NotReadableError extends NotFoundError {
  readonly reason = 'NOT_READABLE';

  constructor(readonly what: 'course' | 'item' | 'file' | 'member' | 'page') {
    super(`${what} not found`);
  }
}
