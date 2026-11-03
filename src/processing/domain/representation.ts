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
  // saving the same one again is harmless
  abstract save(representation: Representation): Promise<void>;
}
