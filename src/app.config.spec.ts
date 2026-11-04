import { appSettings } from './app.config.js';

describe('app settings', () => {
  it('listen on 3000 and trust no proxy unless set', () => {
    expect(appSettings.parse({})).toEqual({ port: 3000, trustProxy: 0 });
    expect(appSettings.parse({ PORT: '8080', TRUST_PROXY: '1' })).toEqual({
      port: 8080,
      trustProxy: 1,
    });
  });

  it('refuse a count of proxies that is none', () => {
    for (const bad of ['-1', '1.5', 'caddy'])
      expect(appSettings.safeParse({ TRUST_PROXY: bad }).success).toBe(false);
  });
});
