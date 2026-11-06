import type { Readable } from 'node:stream';
import type { ContentProcessorOptions, ProcessorInput } from './processors.js';

// Content expanders unpack a content that holds others (an archive) into its
// entries. The hub stores each entry as a content of its own and hands it on
// by its path, to the processors and expanders that take it, as it does a
// portal's file by its name.

// as a processor's: bump the version when the entries it yields change
export type ContentExpanderOptions = ContentProcessorOptions;

export interface ExpandedEntry {
  // where it is in the content, '/' between folders: never absolute, never
  // with a .. in it
  path: string;
  // its size unpacked, when the content says (a gzip's one file has none):
  // the hub leaves out an entry past its limits without reading it
  size?: number;
  // its bytes, asked for at most once and before the next entry; an entry
  // not asked for is skipped
  content(): Promise<Readable>;
}

export interface ExpandsContent {
  // the entries in turn; the hub may stop asking for more
  expand(input: ProcessorInput): AsyncIterable<ExpandedEntry>;
}
