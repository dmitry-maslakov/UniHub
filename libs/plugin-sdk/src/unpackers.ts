import type { Readable } from 'node:stream';
import type { ContentProcessorOptions, ProcessorInput } from './processors.js';

// Content unpackers list the members of a container (an archive). The hub
// stores each member's bytes, runs the processors on them as on files, and
// keeps the budget, the rules for paths and what's left out: an unpacker
// only knows its format.

// as a processor's: bump the version when what's listed changes; one
// unpacker takes a format
export type ContentUnpackerOptions = ContentProcessorOptions;

export interface UnpackerInput extends ProcessorInput {
  // aborts past the hub's time for a container, or at shutdown
  signal: AbortSignal;
}

// a regular file in the container: no folders, links or devices
export interface Member {
  // as the container names it; the hub makes it safe or leaves it out
  path: string;
  // the container's word for it, if it has one (a mail's attachment)
  mime?: string;
  // as the container declares it: the hub leaves out unread one past its
  // limits, and stores no more than it allows whatever the size said
  size?: number;
  // read or destroyed by the hub before it asks for the next member
  content: Readable;
}

export interface UnpacksContent {
  // the members in turn; the hub may stop early (return())
  unpack(input: UnpackerInput): AsyncIterable<Member>;
}
