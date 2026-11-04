import { pluginsSettings } from './plugins.config.js';

describe('plugins settings', () => {
  it('turn built-in plugins on by name, none unless set', () => {
    expect(pluginsSettings.parse({}).enabled).toEqual([]);
    expect(
      pluginsSettings.parse({ PLUGINS: 'office-text, moodle' }).enabled,
    ).toEqual(['office-text', 'moodle']);
    expect(pluginsSettings.safeParse({ PLUGINS: 'Office Text' }).success).toBe(
      false,
    );
  });

  it('give connectors their times, in ms', () => {
    expect(pluginsSettings.parse({})).toMatchObject({
      pollTimeoutMs: 60 * 60_000,
      stopTimeoutMs: 10_000,
      restartMaxMs: 60_000,
    });
    expect(
      pluginsSettings.parse({ CONNECTOR_STOP_SECONDS: '2.5' }).stopTimeoutMs,
    ).toBe(2_500);
  });

  it('refuse a time that is no length', () => {
    for (const bad of ['0', '-1', 'soon'])
      expect(
        pluginsSettings.safeParse({ CONNECTOR_POLL_TIMEOUT_MINUTES: bad })
          .success,
      ).toBe(false);
  });
});
