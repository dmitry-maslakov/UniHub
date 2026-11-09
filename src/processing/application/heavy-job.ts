import type { PluginCatalog } from '../../plugins/contracts.js';
import type { PluginJob } from './plugin-job.js';

// Whether a job goes to the queue of the heavy processors, whose model runs
// only while there's work for it. Only a processor's job can: a plugin that
// is turned off is none, and its job finds nothing to run wherever it waits.
export const isHeavy = (
  job: PluginJob,
  plugins: Pick<PluginCatalog, 'processor'>,
) =>
  job.kind === 'process' &&
  plugins.processor(job.key.processor)?.spec.heavy === true;
