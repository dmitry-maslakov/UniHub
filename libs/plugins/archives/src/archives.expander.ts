import { Injectable } from '@nestjs/common';
import {
  ContentExpander,
  type ExpandsContent,
  type ProcessorInput,
} from '@app/plugin-sdk';
import { LIMITS } from './entries.js';
import { ARCHIVE } from './formats.js';
import { entriesOf } from './unpack.js';

// The files in zip, tar and gzip archives, each by its path, for the hub to
// store and hand to whichever processor or expander takes it: an archive in
// one is an entry like any other.
@ContentExpander({
  name: 'archives',
  version: 1,
  accepts: Object.keys(ARCHIVE),
})
@Injectable()
export class ArchivesExpander implements ExpandsContent {
  expand(input: ProcessorInput) {
    return entriesOf(input, LIMITS);
  }
}
