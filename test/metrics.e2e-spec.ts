import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import request from 'supertest';
import { bootApp, bootWorker } from './app.js';

// away from a developer's own, as gRPC's is (test/env.ts), and below the
// ports the system hands out to outgoing connections
const API_PORT = 19464;
const WORKER_PORT = 19465;

// what a scrape of the port reads: the metrics' names, and a metric's
// series by their labels
async function scrape(port: number) {
  const res = await fetch(`http://127.0.0.1:${port}/metrics`);
  expect(res.status).toBe(200);
  const lines = (await res.text())
    .split('\n')
    .filter((line) => line && !line.startsWith('#'));
  return {
    names: new Set(lines.map((line) => line.split(/[{ ]/)[0])),
    series: (name: string) =>
      lines
        .filter((line) => line.startsWith(`${name}{`))
        .map((line) => line.slice(0, line.lastIndexOf(' ')))
        .sort(),
  };
}

// METRICS_PORT's wiring: each process serves its own metrics there, only a
// worker the queues' counts, and the app's own port none. What they count
// is checked in the unit specs.
describe('metrics', () => {
  let api: INestApplication | undefined;
  let worker: INestApplicationContext | undefined;

  afterAll(async () => {
    await api?.close();
    await worker?.close();
    vi.unstubAllEnvs();
  });

  it("serves each process's own on METRICS_PORT, the queues' counts from the worker alone", async () => {
    vi.stubEnv('METRICS_PORT', String(API_PORT));
    api = await bootApp({ role: 'api' });
    vi.stubEnv('METRICS_PORT', String(WORKER_PORT));
    worker = await bootWorker();

    // the event loop's delay once it has a few samples, the queues' counts
    // once redis is ready
    await vi.waitFor(
      async () => {
        const [ofApi, ofWorker] = await Promise.all([
          scrape(API_PORT),
          scrape(WORKER_PORT),
        ]);
        for (const { names } of [ofApi, ofWorker])
          expect([...names]).toEqual(
            expect.arrayContaining([
              'process_cpu_time_total',
              'process_memory_usage',
              'nodejs_eventloop_delay_p99',
              'v8js_memory_heap_used',
            ]),
          );
        expect([...ofApi.names]).not.toContain('unihub_queue_jobs');
        expect([...ofWorker.names]).toContain('unihub_queue_counts_read');
        expect(ofWorker.series('unihub_queue_rate_limited')).toEqual([
          'unihub_queue_rate_limited{queue="connectors"}',
          'unihub_queue_rate_limited{queue="plugins"}',
          'unihub_queue_rate_limited{queue="search-index"}',
        ]);
        expect(ofWorker.series('unihub_queue_jobs')).toEqual(
          expect.arrayContaining(
            ['waiting', 'active', 'delayed', 'failed'].map(
              (state) =>
                `unihub_queue_jobs{queue="search-index",state="${state}"}`,
            ),
          ),
        );
      },
      { timeout: 10_000, interval: 200 },
    );

    // nor on the app's own port, where any other path is the web app's
    const onApp = await request(api.getHttpServer()).get('/metrics');
    expect(onApp.text).not.toContain('# HELP');
  }, 30_000);
});
