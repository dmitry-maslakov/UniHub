import { z } from 'zod';
import { settings } from '../config/settings.js';

// What this process runs, so the API and the background work can run apart
// from one image (README, Running the API and the worker apart): `api` the
// HTTP app and gRPC, which only add work (jobs, outbox messages); `worker`
// that work, with no server; `all` both in one process; `models` only the
// batch run that drains the heavy processors' queue and exits (README,
// Heavy processors).
export const roleSettings = z
  .object({
    APP_ROLE: z.enum(['all', 'api', 'worker', 'models']).default('all'),
  })
  .transform(({ APP_ROLE }) => ({
    // REST, auth, MCP and gRPC ingest (main.ts)
    api: APP_ROLE === 'all' || APP_ROLE === 'api',
    // the queues' workers, the crons and what runs at start (the scheduler),
    // the push connectors among it, and the outbox relay
    worker: APP_ROLE === 'all' || APP_ROLE === 'worker',
    // the one worker of the `models` queue, which no other role reads, and
    // nothing else
    models: APP_ROLE === 'models',
  }));

export const roleConfig = settings('role', roleSettings);
