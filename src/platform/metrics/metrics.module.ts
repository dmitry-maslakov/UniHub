import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { metricsConfig } from './metrics.config.js';

// the app's Meter (@opentelemetry/api), for what the modules count
export const METER = Symbol('METER');

// With METRICS_PORT, a provider whose PrometheusExporter serves what it
// holds on that port, read when a scrape asks; without it, one with no
// reader, so what the modules record goes nowhere and nothing is served.
async function meterProvider({ port }: ConfigType<typeof metricsConfig>) {
  if (port === null) return new MeterProvider();
  const exporter = new PrometheusExporter({
    // on every interface, as the app's port is: the scraper comes over the
    // private network, and nothing publishes it (README, Metrics)
    host: '0.0.0.0',
    port,
    // started here, so a port in use stops the app at start: the exporter
    // would only tell OpenTelemetry's silent diag logger
    preventServerStart: true,
    // the scraper labels the target itself
    withoutScopeInfo: true,
    withoutTargetInfo: true,
  });
  await exporter.startServer();
  return new MeterProvider({ readers: [exporter] });
}

// The app's own MeterProvider, never OpenTelemetry's global one: that's
// NestJS Observe's once it's linked (AGENTS.md), and neither then gets the
// other's metrics. Global, as every module may count something; nothing is
// sent anywhere, a scraper reads it.
@Global()
@Module({
  imports: [ConfigModule.forFeature(metricsConfig)],
  providers: [
    {
      provide: MeterProvider,
      inject: [metricsConfig.KEY],
      useFactory: meterProvider,
    },
    {
      provide: METER,
      inject: [MeterProvider],
      useFactory: (provider: MeterProvider) => provider.getMeter('unihub'),
    },
  ],
  exports: [METER],
})
export class MetricsModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MetricsModule.name);
  private runtime?: RuntimeNodeInstrumentation;

  constructor(
    private readonly provider: MeterProvider,
    @Inject(metricsConfig.KEY)
    private readonly config: ConfigType<typeof metricsConfig>,
  ) {}

  // the process's own: its CPU and memory, the event loop's delay, GC and
  // the heap, all read when a scrape asks
  onModuleInit() {
    if (this.config.port === null) return;
    new HostMetrics({
      meterProvider: this.provider,
      metricGroups: ['process.cpu', 'process.memory'],
    }).start();
    this.runtime = new RuntimeNodeInstrumentation({ enabled: false });
    this.runtime.setMeterProvider(this.provider);
    this.runtime.enable();
    this.logger.log(`metrics on port ${this.config.port}`);
  }

  // closes the exporter's server too
  async onApplicationShutdown() {
    this.runtime?.disable();
    await this.provider.shutdown();
  }
}
