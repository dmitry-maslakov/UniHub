import { describe, expect, it } from 'vitest';
import { isAdmin } from './is-admin';

describe('isAdmin', () => {
  it("reads admin among Better Auth's comma-separated roles", () => {
    expect(isAdmin({ role: 'admin' })).toBe(true);
    expect(isAdmin({ role: 'user,admin' })).toBe(true);
    expect(isAdmin({ role: 'admin, user' })).toBe(true);
    expect(isAdmin({ role: 'user' })).toBe(false);
    expect(isAdmin({ role: 'superadmin' })).toBe(false);
    expect(isAdmin({ role: '' })).toBe(false);
    expect(isAdmin({ role: null })).toBe(false);
    expect(isAdmin({})).toBe(false);
  });
});
