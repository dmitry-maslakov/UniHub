import type { Readable } from 'node:stream';
import type { ContentHash, MediaType } from '@app/kernel';

// Content processors turn a file into text a model can read.

export interface ContentProcessorOptions {
  name: string;
  // bump it when the output changes, so stored results get redone
  version: number;
  // media types ('application/pdf') or extensions ('.pdf'), any case; an
  // extension is a file's last ('.gz' of labs.tar.gz), so '.tar.gz' is refused
  accepts: readonly string[];
  // Set by a processor backed by a model that is only up while there is work
  // for it. Its jobs wait in a queue of their own, which a batch run drains
  // (a process with APP_ROLE=models), one job at a time, and each gets
  // `timeoutMinutes` (a whole number, at least 1) to run: `input.signal`
  // aborts then, and the job fails and is tried again. Without it a
  // processor runs in the hub's ordinary queue, as it always did.
  heavy?: { timeoutMinutes: number };
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
  // A heavy processor's: aborts past its `timeoutMinutes` and when the
  // process shuts down, where the job goes back to wait. Stop on it, and
  // reject.
  signal?: AbortSignal;
}

// text split the way the source is split: pages of a pdf, slides of a deck
export interface ProcessorOutput {
  parts: string[];
}

// The most a reader gets at once of text with no unit of its own (a section,
// lines): past this many characters it goes on in the next part. A page or
// a slide is a part however long it is.
export const MAX_PART = 10_000;

// Processors and aggregators get each message at least once and in no
// particular order: the same message can come again after a failure, and an
// item.ingested can arrive after the item.removed that followed it. Handle a
// message so that doing it twice is harmless, and read the current state
// through HubReader rather than trusting the message alone.

export interface ProcessesContent {
  process(input: ProcessorInput): Promise<ProcessorOutput>;
}
