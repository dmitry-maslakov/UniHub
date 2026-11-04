import { parentPort, workerData } from 'node:worker_threads';
import { toParts, type Kind } from './parts.ts';

// Run by plain-text.processor.ts in a thread of its own. In tests node runs
// it as it is, types stripped, and finds a module only by the name it's
// imported by: so this and what it imports name each other's .ts.
const { data, kind }: { data: Uint8Array; kind: Kind } = workerData;
parentPort!.postMessage(toParts(data, kind));
