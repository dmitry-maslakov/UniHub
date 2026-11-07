import { describe, expect, it } from 'vitest';
import { orderSessions } from './order-sessions';

describe('orderSessions', () => {
  it('puts this device first, then the latest active', () => {
    const sessions = [
      { id: 'old', updatedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'here', updatedAt: '2026-11-02T10:00:00.000Z' },
      { id: 'new', updatedAt: new Date('2026-11-06T10:00:00.000Z') },
    ];
    expect(orderSessions(sessions, 'here').map((s) => s.id)).toEqual([
      'here',
      'new',
      'old',
    ]);
  });
});
