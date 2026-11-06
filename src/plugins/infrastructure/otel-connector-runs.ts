import { Inject, Injectable } from '@nestjs/common';
import type { Counter, Gauge, Meter } from '@opentelemetry/api';
import { METER } from '../../platform/metrics/metrics.module.js';
import {
  ConnectorRuns,
  type RunOutcome,
} from '../application/connector-runs.js';

// The runs counted by portal and outcome, and when each portal's poll last
// succeeded, in this process (none since it started, until one does).
@Injectable()
export class OtelConnectorRuns extends ConnectorRuns {
  private readonly runs: Counter;
  private readonly lastSuccess: Gauge;

  constructor(@Inject(METER) meter: Meter) {
    super();
    this.runs = meter.createCounter('unihub.connector.runs', {
      description:
        "connectors' runs: polls that succeeded or failed, push runs that ended or failed",
    });
    this.lastSuccess = meter.createGauge(
      'unihub.connector.last_success_timestamp_seconds',
      {
        description: "when a portal's poll last succeeded, in Unix seconds",
        unit: 's',
      },
    );
  }

  ended(portal: string, outcome: RunOutcome) {
    this.runs.add(1, { portal, outcome });
    if (outcome === 'succeeded')
      this.lastSuccess.record(Date.now() / 1000, { portal });
  }
}
