import { Instance, PortalId } from '@app/kernel';
import { PortalAccount } from './portal-account.js';

const now = new Date('2026-11-06T12:00:00Z');
const site = Instance.parse('https://canvas.example.edu');
const canvas = { userId: 'ana', portal: PortalId.parse('canvas') };
const of = { ...canvas, instance: site, mode: 'token' as const };
const user = (id: string, expiresAt: Date | null = null) => ({ id, expiresAt });

describe('PortalAccount', () => {
  it('is linked, whose and until when the portal said', () => {
    const until = new Date('2026-12-30T08:00:00Z');
    const account = PortalAccount.link(null, of, user('4242', until));

    expect(account.snapshot).toEqual({
      id: expect.any(String),
      ...of,
      portalUser: '4242',
      status: 'linked',
      expiresAt: until,
    });
  });

  it('stays the same account when linked again by the same portal user', () => {
    const first = PortalAccount.link(null, of, user('4242'));
    const again = PortalAccount.link(first, of, user('4242', now));

    expect(again.id).toBe(first.id);
    expect(again.expiresAt).toEqual(now);
  });

  it("is a new account when it's another portal user's credential", () => {
    const first = PortalAccount.link(null, of, user('4242'));
    const other = PortalAccount.link(first, of, user('5151'));

    expect(other.id).not.toBe(first.id);
    expect(other.snapshot.portalUser).toBe('5151');
  });

  it("is a new account when it's of another school's site, the same portal user's id or not", () => {
    const first = PortalAccount.link(null, of, user('4242'));
    const elsewhere = Instance.parse('https://lms.example.org');
    const other = PortalAccount.link(
      first,
      { ...of, instance: elsewhere },
      user('4242'),
    );

    expect(other.id).not.toBe(first.id);
    expect(other.instance).toBe(elsewhere);
  });

  it('comes back linked whatever it was, a new credential being a new start', () => {
    const revoked = PortalAccount.restore({
      ...PortalAccount.link(null, of, user('4242')).snapshot,
      status: 'revoked',
    });
    expect(PortalAccount.link(revoked, of, user('4242')).statusAt(now)).toBe(
      'linked',
    );
  });

  it('is expired past its expiry, and stays whatever a run found', () => {
    const until = (expiresAt: Date | null) =>
      PortalAccount.link(null, of, user('4242', expiresAt));
    expect(until(null).statusAt(now)).toBe('linked');
    expect(until(new Date(now.getTime() + 1)).statusAt(now)).toBe('linked');
    expect(until(now).statusAt(now)).toBe('expired');

    const revoked = PortalAccount.restore({
      ...until(now).snapshot,
      status: 'revoked',
    });
    expect(revoked.statusAt(now)).toBe('revoked');
  });
});
