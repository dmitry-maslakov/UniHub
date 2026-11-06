import { Injectable } from '@nestjs/common';
import {
  ContentUnpacker,
  type UnpackerInput,
  type UnpacksContent,
} from '@app/plugin-sdk';
import { ARCHIVE } from './formats.js';
import { LIMITS, membersOf } from './unpack.js';

// The files in zip, tar and gzip archives, for the hub to store and process
// as files of their names: an archive in one is a member like any other,
// which the hub opens in turn.
@ContentUnpacker({
  name: 'archives',
  version: 1,
  accepts: Object.keys(ARCHIVE),
})
@Injectable()
export class ArchivesUnpacker implements UnpacksContent {
  unpack(input: UnpackerInput) {
    return membersOf(input, LIMITS);
  }
}
