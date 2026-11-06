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

  it("set users' accounts' grids and their publication, in ms, within sane bounds", () => {
    expect(pluginsSettings.parse({})).toMatchObject({
      concurrency: 4,
      publishing: {
        slotMs: 60 * 60_000,
        delayMs: 10 * 60_000,
        holdMs: 15 * 60_000,
      },
    });
    for (const bad of [
      { VIEW_MINUTES: '4' },
      { VIEW_MINUTES: '1441' },
      { HOLD_MINUTES: '-1' },
      { HOLD_MINUTES: '2.5' },
      { PUBLISH_DELAY_MINUTES: '60' },
      { VIEW_MINUTES: '15', PUBLISH_DELAY_MINUTES: '20' },
      { CONNECTOR_CONCURRENCY: '0' },
      { CONNECTOR_CONCURRENCY: '65' },
    ])
      expect(pluginsSettings.safeParse(bad).success).toBe(false);
    expect(
      pluginsSettings.parse({ PUBLISH_DELAY_MINUTES: '0', HOLD_MINUTES: '0' })
        .publishing,
    ).toMatchObject({ delayMs: 0, holdMs: 0 });
  });
});
