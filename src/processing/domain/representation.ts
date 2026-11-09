import type { ContentHash, PluginName } from '@app/kernel';

// What a processor made of some content. Kept by the content, so a file
// shared by several courses is processed once, and by the processor's
// version, so a new version does it again.
export interface RepresentationKey {
  hash: ContentHash;
  processor: PluginName;
  version: number;
}

// the key as one string, for ids: the same work has the same one
export const keyId = ({ hash, processor, version }: RepresentationKey) =>
  `${hash}__${processor}__${version}`;

export interface Representation extends RepresentationKey {
  // pages, slides or sections, the way the source is split
  parts: string[];
}

// The parts as postgres keeps them in jsonb, which takes no NUL and no lone
// surrogate. Parsers leave either in now and then (a pdf's broken font
// map), and a save they fail would fail on every try.
export const representation = (
  key: RepresentationKey,
  parts: readonly string[],
): Representation => ({
  ...key,
  parts: parts.map((part) => part.replaceAll('\u0000', '').toWellFormed()),
});

export abstract class RepresentationRepository {
  abstract exists(key: RepresentationKey): Promise<boolean>;
  // every (hash, processor, version) there is for these contents
  abstract keysOf(hashes: readonly ContentHash[]): Promise<RepresentationKey[]>;
  // the newest version a processor made of this content; null if none
  abstract newest(
    hash: ContentHash,
    processor: PluginName,
  ): Promise<Representation | null>;
  // the newest version of every (hash, processor), for ReconcileIndex
  abstract newestKeys(): AsyncIterable<RepresentationKey>;
  // saving the same one again is harmless
  abstract save(representation: Representation): Promise<void>;
}
