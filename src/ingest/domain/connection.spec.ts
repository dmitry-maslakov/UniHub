import { Instance, NO_INSTANCE, PortalId, SHARED_ACCOUNT } from '@app/kernel';
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

  it('reads a site of its portal, none unless told, which its key leaves out', () => {
    const site = Instance.parse('https://canvas.example.edu');
    const portal = PortalId.parse('canvas');
    expect(Connection.shared(portal).instance).toBe(NO_INSTANCE);
    expect(Connection.shared(portal, site)).toMatchObject({ instance: site });
    const own = Connection.of({ portal, account: 'u-1' });
    expect(own.instance).toBe(NO_INSTANCE);
    expect(own.at(site)).toMatchObject({
      portal,
      account: 'u-1',
      instance: site,
      key: own.key,
    });
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
