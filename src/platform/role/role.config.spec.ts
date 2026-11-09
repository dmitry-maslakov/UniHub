import { roleSettings } from './role.config.js';

describe('role settings', () => {
  it('run the API and the background work in one process unless told', () => {
    expect(roleSettings.parse({})).toEqual({
      api: true,
      worker: true,
      models: false,
    });
    expect(roleSettings.parse({ APP_ROLE: 'all' })).toEqual({
      api: true,
      worker: true,
      models: false,
    });
  });

  it('run one of them apart', () => {
    expect(roleSettings.parse({ APP_ROLE: 'api' })).toEqual({
      api: true,
      worker: false,
      models: false,
    });
    expect(roleSettings.parse({ APP_ROLE: 'worker' })).toEqual({
      api: false,
      worker: true,
      models: false,
    });
    expect(roleSettings.parse({ APP_ROLE: 'models' })).toEqual({
      api: false,
      worker: false,
      models: true,
    });
  });

  it('refuse a role there is none of', () => {
    for (const bad of ['', 'API', 'web', 'api,worker'])
      expect(roleSettings.safeParse({ APP_ROLE: bad }).success).toBe(false);
  });
});
