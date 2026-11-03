import { extname } from 'node:path';
import { buffer } from 'node:stream/consumers';
import { Injectable } from '@nestjs/common';
import { OfficeConverter } from 'officeparser';
import {
  ContentProcessor,
  type ProcessesContent,
  type ProcessorInput,
} from '@app/plugin-sdk';

type SplitBy = 'page' | 'slide' | 'heading';

// how each kind of document is split into parts
const KINDS: Record<string, { mime: string; splitBy: SplitBy }> = {
  '.pdf': { mime: 'application/pdf', splitBy: 'page' },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    splitBy: 'slide',
  },
  '.odp': {
    mime: 'application/vnd.oasis.opendocument.presentation',
    splitBy: 'slide',
  },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    splitBy: 'heading',
  },
  '.odt': {
    mime: 'application/vnd.oasis.opendocument.text',
    splitBy: 'heading',
  },
};

const kindOf = ({ name, mime }: ProcessorInput) =>
  KINDS[extname(name).toLowerCase()] ??
  Object.values(KINDS).find((k) => k.mime === mime);

// Text of pdf / pptx / docx / odt / odp, one part per page, slide or heading,
// using officeparser's own chunking.
@ContentProcessor({
  name: 'office-text',
  version: 1,
  accepts: Object.entries(KINDS).flatMap(([ext, { mime }]) => [ext, mime]),
})
@Injectable()
export class OfficeTextProcessor implements ProcessesContent {
  async process(input: ProcessorInput) {
    const kind = kindOf(input);
    if (!kind) return { parts: [] };

    const data = await buffer(await input.content());
    const { value: chunks } = await OfficeConverter.convert(data, 'chunks', {
      generatorConfig: {
        chunksConfig: {
          strategy: 'document-structure',
          splitBy: kind.splitBy,
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
