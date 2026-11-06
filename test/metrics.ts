import type { Attributes } from '@opentelemetry/api';
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';

// collected by the spec itself, as PrometheusExporter does on a scrape
class SpecReader extends MetricReader {
  protected async onShutdown() {}
  protected async onForceFlush() {}
}

const named = (name: string, attributes: Attributes) => {
  const labels = Object.entries(attributes)
    .map(([label, value]) => `${label}=${String(value)}`)
    .join(',');
  return labels ? `${name}{${labels}}` : name;
};

// A meter for the specs, and what a scrape would read of it, by name and
// labels: { 'unihub.queue.jobs{queue=plugins,state=waiting}': 3 }, a
// histogram by its count.
export function testMeter() {
  const reader = new SpecReader();
  const meter = new MeterProvider({ readers: [reader] }).getMeter('spec');
  const read = async () => {
    const { resourceMetrics, errors } = await reader.collect();
    if (errors.length) throw errors[0];
    const values: Record<string, number> = {};
    for (const { metrics } of resourceMetrics.scopeMetrics)
      for (const { descriptor, dataPoints } of metrics)
        for (const { attributes, value } of dataPoints)
          values[named(descriptor.name, attributes)] =
            typeof value === 'number' ? value : value.count;
    return values;
  };
  return { meter, read };
}
