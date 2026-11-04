import type { Readable } from 'node:stream';
import type { ContentHash, MediaType } from '@app/kernel';

// Content processors turn a file into text a model can read.

export interface ContentProcessorOptions {
  name: string;
  // bump it when the output changes, so stored results get redone
  version: number;
  // media types ('application/pdf') or extensions ('.pdf'), any case
  accepts: readonly string[];
}

export interface ProcessorInput {
  name: string;
  // the media type's essence ('application/pdf'); null when the portal gave
  // none or nothing that is one
  mime: MediaType | null;
  // The accepts entry this file matched, as the processor wrote it: by the
  // file's extension if one matches, by its media type otherwise. The hub
  // only hands a processor files it accepts, so this says which kind it got.
  matched: string;
  hash: ContentHash;
  // a fresh stream on every call, closed by the hub after the run
  content(): Promise<Readable>;
}

// text split the way the source is split: pages of a pdf, slides of a deck
export interface ProcessorOutput {
  parts: string[];
}

// Processors and aggregators get each message at least once and in no
// particular order: the same message can come again after a failure, and an
// item.ingested can arrive after the item.removed that followed it. Handle a
// message so that doing it twice is harmless, and read the current state
// through HubReader rather than trusting the message alone.

export interface ProcessesContent {
  process(input: ProcessorInput): Promise<ProcessorOutput>;
}
