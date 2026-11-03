export interface Representation {
  hash: string;
  processor: string;
  version: number;
  // pages, slides or sections, the way the source is split
  parts: string[];
}

export interface TextInfo {
  processor: string;
  version: number;
  pages: number;
}

export interface TextPage extends TextInfo {
  page: number;
  text: string;
}

export abstract class RepresentationRepository {
  abstract exists(
    hash: string,
    processor: string,
    version: number,
  ): Promise<boolean>;
  // what each processor made, its newest version, without the text
  abstract texts(hash: string): Promise<TextInfo[]>;
  // one part of the newest version; the first processor's unless one is named
  abstract page(
    hash: string,
    page: number,
    processor?: string,
  ): Promise<TextPage | null>;
  // saving the same one again is harmless
  abstract save(representation: Representation): Promise<void>;
}
