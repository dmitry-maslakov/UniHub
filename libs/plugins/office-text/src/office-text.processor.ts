import { Injectable } from '@nestjs/common';
import {
  ContentProcessor,
  readUpTo,
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
    const data = await readUpTo(await input.content(), MAX_BYTES);
    if (!data) throw new Error(`larger than ${MAX_BYTES} bytes, not parsed`);
    const parsed = await parse(data, {
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
