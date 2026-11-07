import { describe, expect, it } from 'vitest';
import { pollStatus } from './poll-status';

describe('pollStatus', () => {
  it("reads Better Auth's answers to a poll", () => {
    expect(pollStatus('authorization_pending')).toBe('pending');
    expect(pollStatus('slow_down')).toBe('slowDown');
    expect(pollStatus('access_denied')).toBe('denied');
    expect(pollStatus('expired_token')).toBe('expired');
    expect(pollStatus('invalid_grant')).toBe('failed');
    expect(pollStatus()).toBe('failed');
  });
});
