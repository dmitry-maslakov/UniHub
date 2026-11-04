import type { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import {
  ContentProcessor,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { parse } from './parse.js';
import { MAX_SECTION, toParts, type SplitBy } from './parts.js';

// how each kind of document is split into parts, by extension and media type
const SPLIT_BY: Record<string, SplitBy> = {
  '.pdf': 'page',
  'application/pdf': 'page',
  '.pptx': 'slide',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    'slide',
  '.odp': 'slide',
  'application/vnd.oasis.opendocument.presentation': 'slide',
  '.docx': 'heading',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'heading',
  '.odt': 'heading',
  'application/vnd.oasis.opendocument.text': 'heading',
};

// past this a document isn't parsed, it's held in memory twice meanwhile
export const MAX_BYTES = 100 * 1024 * 1024;

async function read(content: Readable) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of content as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BYTES)
      throw new Error(`larger than ${MAX_BYTES} bytes, not parsed`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

// Text of pdf / pptx / docx / odt / odp, one part per page, slide or
// section, made of officeparser's chunks.
@ContentProcessor({
  name: 'office-text',
  version: 2,
  accepts: Object.keys(SPLIT_BY),
})
@Injectable()
export class OfficeTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    // the hub hands over only what's in accepts, so it's one of these
    const splitBy = SPLIT_BY[input.matched];
    const parsed = await parse(await read(await input.content()), {
      chunksConfig: {
        strategy: 'document-structure',
        splitBy,
        // a page or slide is kept whole, it's the unit a part stands for;
        // a long section comes in chunks a part can end at
        maxChunkSize: splitBy === 'heading' ? MAX_SECTION : 1_000_000,
      },
    });
    return { parts: toParts(parsed, splitBy) };
  }
}
