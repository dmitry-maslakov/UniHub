import { parentPort, workerData } from 'node:worker_threads';
import { OfficeParser } from 'officeparser';

// Run by officeparser-html-text.ts in a thread of its own. Imports nothing
// of this repo: in tests node runs it as it is, types stripped. A string
// officeparser refuses (nested past its limit) reads as ''.
const { html }: { html: string[] } = workerData;
const texts: string[] = [];
for (const one of html) {
  try {
    const ast = await OfficeParser.parseOffice(Buffer.from(one), {
      fileType: 'html',
    });
    texts.push((await ast.to('text')).value.trim());
  } catch {
    texts.push('');
  }
}
parentPort!.postMessage(texts);
