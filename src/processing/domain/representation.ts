import type { ContentHash, PluginName } from '@app/kernel';

// What a processor made of some content. Kept by the content, so a file
// shared by several courses is processed once, and by the processor's
// version, so a new version does it again.
export interface RepresentationKey {
  hash: ContentHash;
  processor: PluginName;
  version: number;
}

export interface Representation extends RepresentationKey {
  // pages, slides or sections, the way the source is split
  parts: string[];
}

export abstract class RepresentationRepository {
  abstract exists(key: RepresentationKey): Promise<boolean>;
  // saving the same one again is harmless
  abstract save(representation: Representation): Promise<void>;
}
