import { Worker } from 'node:worker_threads';
import { Injectable } from '@nestjs/common';
import type { GeneratorConfig, SupportedFileType } from 'officeparser';
import {
  ContentProcessor,
  firstMessage,
  MAX_PART,
  readUpTo,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { toParts, type Parsed, type SplitBy } from './parts.js';

// How a kind of document is split into parts, and its format for
// officeparser when the bytes can't tell it: html has no magic bytes, the
// rest have.
interface Format {
  splitBy: SplitBy;
  fileType?: SupportedFileType;
}
const PAGES: Format = { splitBy: 'page' };
const SLIDES: Format = { splitBy: 'slide' };
const SECTIONS: Format = { splitBy: 'heading' };
// a page's scripts and styles are left out
const HTML: Format = { splitBy: 'heading', fileType: 'html' };

// by extension and media type
const FORMATS: Record<string, Format> = {
  '.pdf': PAGES,
  'application/pdf': PAGES,
  '.pptx': SLIDES,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    SLIDES,
  '.odp': SLIDES,
  'application/vnd.oasis.opendocument.presentation': SLIDES,
  '.docx': SECTIONS,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    SECTIONS,
  '.odt': SECTIONS,
  'application/vnd.oasis.opendocument.text': SECTIONS,
  '.html': HTML,
  '.htm': HTML,
  'text/html': HTML,
  '.rtf': SECTIONS,
  'application/rtf': SECTIONS,
  'text/rtf': SECTIONS,
  '.epub': SECTIONS,
  'application/epub+zip': SECTIONS,
};

// past this a document isn't parsed, it's held in memory twice meanwhile
export const MAX_BYTES = 100 * 1024 * 1024;
// a document past these ends its own thread, and the hub goes on
const HEAP_MB = 512;
const TIMEOUT_MS = 3 * 60_000;

// Text of pdf / pptx / docx / odt / odp / html / rtf / epub, one part per
// page, slide or section, made of officeparser's chunks.
@ContentProcessor({
  name: 'office-text',
  // still 2 with html, rtf and epub taken: the other formats come out as
  // before, so what's stored stays, and reconcile queues the new ones
  version: 2,
  accepts: Object.keys(FORMATS),
})
@Injectable()
export class OfficeTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    // the hub hands over only what's in accepts, so it's one of these
    const { splitBy, fileType = null } = FORMATS[input.matched];
    const data = await readUpTo(await input.content(), MAX_BYTES);
    if (!data) throw new Error(`larger than ${MAX_BYTES} bytes, not parsed`);
    const config: GeneratorConfig<'chunks'> = {
      chunksConfig: {
        strategy: 'document-structure',
        splitBy,
        // a page or slide is kept whole, it's the unit a part stands for;
        // a long section comes in chunks a part can end at
        maxChunkSize: splitBy === 'heading' ? MAX_PART : 1_000_000,
      },
    };
    const parsed = await firstMessage<Parsed>(
      new Worker(new URL('./parse.worker.ts', import.meta.url), {
        workerData: { data, fileType, config },
        resourceLimits: { maxOldGenerationSizeMb: HEAP_MB },
      }),
      TIMEOUT_MS,
    );
    return { parts: toParts(parsed, splitBy) };
  }
}
