import { testMeter } from '../../../test/metrics.js';
import { OtelConnectorRuns } from './otel-connector-runs.js';

describe('OtelConnectorRuns', () => {
  afterEach(() => vi.useRealTimers());

  it('counts runs by portal and outcome, and keeps when a poll last succeeded', async () => {
    const noon = Date.UTC(2026, 10, 6, 12);
    vi.useFakeTimers({ toFake: ['Date'], now: noon });
    const { meter, read } = testMeter();
    const runs = new OtelConnectorRuns(meter);

    runs.ended('canvas', 'succeeded');
    vi.setSystemTime(noon + 60_000);
    runs.ended('canvas', 'failed');
    runs.ended('teams', 'ended');
    runs.ended('teams', 'failed');

    expect(await read()).toEqual({
      'unihub.connector.runs{portal=canvas,outcome=succeeded}': 1,
      'unihub.connector.runs{portal=canvas,outcome=failed}': 1,
      'unihub.connector.runs{portal=teams,outcome=ended}': 1,
      'unihub.connector.runs{portal=teams,outcome=failed}': 1,
      'unihub.connector.last_success_timestamp_seconds{portal=canvas}':
        noon / 1000,
    });
  });
});
