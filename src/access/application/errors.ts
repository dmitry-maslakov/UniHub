import { NotFoundError } from '@app/kernel';

// what a user asked for and can't read: gone, never there, or not theirs,
// one answer for all three
export class NotReadableError extends NotFoundError {
  constructor(readonly what: 'course' | 'file' | 'page') {
    super(`${what} not found`);
  }
}
