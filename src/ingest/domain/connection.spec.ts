import { PortalId } from '@app/kernel';
import { Connection, SHARED_ACCOUNT } from './connection.js';

describe('Connection', () => {
  it('is one account on one portal, with a key of its own', () => {
    const shared = Connection.shared(PortalId.parse('canvas'));
    expect(shared).toMatchObject({ portal: 'canvas', account: SHARED_ACCOUNT });
    expect(shared.key).toBe('canvas__shared');
    expect(Connection.of({ portal: 'canvas', account: 'u-1' }).key).toBe(
      'canvas__u-1',
    );
  });

  it('removes records only for what everyone sees', () => {
    expect(Connection.shared(PortalId.parse('moodle')).mayRemoveRecords).toBe(
      true,
    );
    expect(
      Connection.of({ portal: 'moodle', account: 'someone' }).mayRemoveRecords,
    ).toBe(false);
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
