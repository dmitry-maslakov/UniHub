import type { Readable } from 'node:stream';
import type { ContentProcessorOptions, ProcessorInput } from './processors.js';

// Content unpackers list the members of a container (an archive). The hub
// stores each member's bytes, runs the processors on them as on files, and
// keeps the budget, the rules for paths and what's left out: an unpacker
// only knows its format.

// as a processor's: bump the version when what's listed changes. A format
// has one unpacker: two that accept the same extension or media type stop
// the app at start, and a file one takes by its extension and another by its
// media type goes by its extension.
export type ContentUnpackerOptions = ContentProcessorOptions;

// The container as a stream from its start, as a processor gets content: a
// format with its index at the end (zip's central directory) is read whole.
export interface UnpackerInput extends ProcessorInput {
  // Aborts past the hub's time for a container, or at shutdown. return()
  // can't reach a generator waiting on a read, so pass it to every wait
  // (pipeline, once) and throw its reason; the hub then fails the job.
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
  // Read to its end, or partway and destroyed, by the hub before it asks for
  // the next member: what the hub left of it is the unpacker's to skip, so
  // don't wait for its 'end' (a destroyed stream only closes).
  content: Readable;
}

export interface UnpacksContent {
  // The members in turn. The hub may stop asking (return() at a yield), so
  // clean up in finally; it closes the container's streams afterwards. A
  // throw from here or from a member's stream is the container's fault: the
  // hub keeps what it listed so far, the tree cut short.
  unpack(input: UnpackerInput): AsyncIterable<Member>;
}
