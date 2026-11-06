import { Inject, Injectable } from '@nestjs/common';
import type { Counter, Histogram, Meter } from '@opentelemetry/api';
import { METER } from '../../platform/metrics/metrics.module.js';
import {
  SearchMetrics,
  type SearchOutcome,
  type UnrankedReason,
} from '../application/ports.js';

// a search waits up to 3 s for the query's vector, 5 s for the index and 5 s
// for the reranker
const BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15];

@Injectable()
export class OtelSearchMetrics extends SearchMetrics {
  private readonly duration: Histogram;
  private readonly fallbacks: Counter;

  constructor(@Inject(METER) meter: Meter) {
    super();
    this.duration = meter.createHistogram('unihub.search.duration_seconds', {
      description: 'how long a search took, by whether it answered',
      unit: 's',
      advice: { explicitBucketBoundaries: BUCKETS },
    });
    this.fallbacks = meter.createCounter('unihub.search.rerank_fallbacks', {
      description:
        "searches answered in the index's order: the reranker busy with another, away, past its time, or failing otherwise",
    });
  }

  searched(outcome: SearchOutcome, seconds: number) {
    this.duration.record(seconds, { outcome });
  }

  unranked(reason: UnrankedReason) {
    this.fallbacks.add(1, { reason });
  }
}
