import { parentPort, workerData } from 'node:worker_threads';
import { partsOf, textFiles, type Limits } from './archive.ts';
import type { ArchiveFormat } from './formats.ts';

// Run by archive-text.processor.ts in a thread of its own, as parse.worker.ts
// is by plain-text's; the sdk's MAX_PART comes as max.
const {
  data,
  format,
  name,
  limits,
  max,
}: {
  data: Uint8Array;
  format: ArchiveFormat;
  name: string;
  limits: Limits;
  max: number;
} = workerData;

const parts: string[] = [];
// a Buffer over the bytes the thread was given, not a copy of them
const archive = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
for await (const file of textFiles(archive, format, name, limits))
  parts.push(...partsOf(file, max));
parentPort!.postMessage(parts);
