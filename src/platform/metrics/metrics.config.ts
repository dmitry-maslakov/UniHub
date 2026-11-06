import { z } from 'zod';
import { blank, settings } from '../config/settings.js';

const port = z.coerce.number().int().min(1).max(65_535);

// Prometheus metrics for a scraper, on a port of their own, off unless set
// (README, Metrics). Never the app's HTTP port, which faces the internet.
export const metricsSettings = z
  .object({
    METRICS_PORT: blank(port),
    // appConfig's, the api's: read here only to keep the two apart
    PORT: z.coerce.number().int().default(3000),
  })
  .refine((env) => env.METRICS_PORT !== env.PORT, {
    path: ['METRICS_PORT'],
    message: "must not be the app's PORT, which faces the internet",
  })
  .transform((env) => ({ port: env.METRICS_PORT ?? null }));

export const metricsConfig = settings('metrics', metricsSettings);
