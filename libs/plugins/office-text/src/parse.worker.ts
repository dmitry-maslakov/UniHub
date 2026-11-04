import { parentPort, workerData } from 'node:worker_threads';
import {
  OfficeParser,
  type GeneratorConfig,
  type OfficeContentNode,
} from 'officeparser';

// Run by parse.ts in a thread of its own. Imports nothing of this repo: in
// tests node runs it as it is, types stripped.
const { data, config } = workerData as {
  data: Uint8Array;
  config: GeneratorConfig<'chunks'>;
};
// attachments taken as OfficeConverter takes them for chunks: a picture's
// alt text and a chart's text are in the chunks only then
const ast = await OfficeParser.parseOffice(data, { extractAttachments: true });
const { value: chunks } = await ast.to('chunks', config);

// a page or slide without text makes no chunk, so how many the document has
// comes from its nodes (0 for one that has neither)
const numberOf = (node: OfficeContentNode) =>
  (node.type === 'page' && node.metadata?.pageNumber) ||
  (node.type === 'slide' && node.metadata?.slideNumber) ||
  0;
const units = ast.content.reduce((n, node) => Math.max(n, numberOf(node)), 0);

parentPort!.postMessage({ chunks, units });
