import { parentPort, workerData } from 'node:worker_threads';
import { OfficeConverter, type OfficeConverterConfig } from 'officeparser';

// Run by parse.ts in a thread of its own. Imports nothing of this repo: in
// tests node runs it as it is, types stripped.
const { data, config } = workerData as {
  data: Uint8Array;
  config: OfficeConverterConfig<'chunks'>;
};
const { value } = await OfficeConverter.convert(data, 'chunks', config);
parentPort!.postMessage(value);
