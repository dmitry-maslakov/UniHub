import { PortalId, SHARED_ACCOUNT } from '@app/kernel';
import { Connection } from './connection.js';

describe('Connection', () => {
  it('is one account on one portal, with a key of its own', () => {
    const shared = Connection.shared(PortalId.parse('canvas'));
    expect(shared).toMatchObject({ portal: 'canvas', account: SHARED_ACCOUNT });
    expect(shared.key).toBe('canvas__shared');
    expect(Connection.of({ portal: 'canvas', account: 'u-1' }).key).toBe(
      'canvas__u-1',
    );
  });

  it('is the shared account, whose records everyone sees, or a user’s', () => {
    expect(Connection.shared(PortalId.parse('moodle')).shared).toBe(true);
    expect(Connection.of({ portal: 'moodle', account: 'someone' }).shared).toBe(
      false,
    );
  });

  it("refuses what a key or a job id can't take apart", () => {
    for (const bad of [
      { portal: 'Canvas', account: 'shared' },
      { portal: 'canvas', account: 'a__b' },
      { portal: 'canvas', account: 'a:b' },
      { portal: 'canvas', account: '' },
    ])
      expect(() => Connection.of(bad)).toThrow();
  });
});
