import { metricsSettings } from './metrics.config.js';

describe('metrics settings', () => {
  it('serve none unless a port is set, an empty one as unset', () => {
    expect(metricsSettings.parse({})).toEqual({ port: null });
    expect(metricsSettings.parse({ METRICS_PORT: '' })).toEqual({
      port: null,
    });
    expect(metricsSettings.parse({ METRICS_PORT: '9464' })).toEqual({
      port: 9464,
    });
  });

  it("refuse what isn't a port, and the app's own", () => {
    for (const bad of [
      { METRICS_PORT: '0' },
      { METRICS_PORT: '65536' },
      { METRICS_PORT: '94.64' },
      { METRICS_PORT: 'metrics' },
      // the app's port unless told, and the one it's told
      { METRICS_PORT: '3000' },
      { METRICS_PORT: '8080', PORT: '8080' },
    ])
      expect(metricsSettings.safeParse(bad).success).toBe(false);
    expect(
      metricsSettings.parse({ METRICS_PORT: '3000', PORT: '8080' }).port,
    ).toBe(3000);
  });
});
