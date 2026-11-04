import { buffer } from 'node:stream/consumers';
import { Injectable } from '@nestjs/common';
import { OfficeConverter } from 'officeparser';
import {
  ContentProcessor,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';

type SplitBy = 'page' | 'slide' | 'heading';

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

// Text of pdf / pptx / docx / odt / odp, one part per page, slide or heading,
// using officeparser's own chunking.
@ContentProcessor({
  name: 'office-text',
  version: 1,
  accepts: Object.keys(SPLIT_BY),
})
@Injectable()
export class OfficeTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    const data = await buffer(await input.content());
    const { value: chunks } = await OfficeConverter.convert(data, 'chunks', {
      generatorConfig: {
        chunksConfig: {
          strategy: 'document-structure',
          // the hub hands over only what's in accepts, so it's one of these
          splitBy: SPLIT_BY[input.matched],
          // keep a page or slide whole, it is the unit a part stands for
          maxChunkSize: 1_000_000,
        },
      },
    });

    // chunks of one page, slide or section are consecutive
    const parts: string[] = [];
    let last: unknown;
    for (const { text, metadata } of chunks) {
      const unit =
        metadata.pageNumber ?? metadata.slideNumber ?? metadata.closestHeading;
      if (parts.length && unit === last) parts[parts.length - 1] += `\n${text}`;
      else parts.push(text);
      last = unit;
    }
    return { parts };
  }
}
