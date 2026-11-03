export interface Representation {
  hash: string;
  processor: string;
  version: number;
  // pages, slides or sections, the way the source is split
  parts: string[];
}

export abstract class RepresentationRepository {
  abstract exists(
    hash: string,
    processor: string,
    version: number,
  ): Promise<boolean>;
  // the newest version of each processor's result
  abstract latestOf(hash: string): Promise<Representation[]>;
  // saving the same one again is harmless
  abstract save(representation: Representation): Promise<void>;
}
