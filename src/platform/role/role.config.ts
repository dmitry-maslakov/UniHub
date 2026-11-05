import { z } from 'zod';
import { settings } from '../config/settings.js';

// What this process runs, so the API and the background work can run apart
// from one image (README, Running the API and the worker apart): `api` the
// HTTP app and gRPC, which only add work (jobs, outbox messages); `worker`
// that work, with no server; `all` both in one process.
export const roleSettings = z
  .object({ APP_ROLE: z.enum(['all', 'api', 'worker']).default('all') })
  .transform(({ APP_ROLE }) => ({
    // REST, auth, MCP and gRPC ingest (main.ts)
    api: APP_ROLE !== 'worker',
    // the queues' workers, the crons and what runs at start (the scheduler),
    // the push connectors among it, and the outbox relay
    worker: APP_ROLE !== 'api',
  }));

export const roleConfig = settings('role', roleSettings);
