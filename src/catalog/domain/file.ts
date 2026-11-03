import type { Upserted } from './changes.js';

// what we know about a file; the content itself lives in storage
export interface File {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  itemId: string | null;
  name: string;
  // folder inside the portal, '' for the root
  path: string;
  url: string | null;
  size: number | null;
  mime: string | null;
  sourceUpdatedAt: Date | null;
  contentHash: string | null;
  // the portal changed the file since its content was stored
  contentStale: boolean;
  // the portal said it's gone; sending it again clears this
  removedAt: Date | null;
}

// the content fields aren't the portal's to set
export type FileData = Omit<File, 'id' | 'contentHash' | 'contentStale'>;

export abstract class FileRepository {
  abstract upsert(data: FileData): Promise<Upserted<File>>;
  abstract findById(id: string): Promise<File | null>;
  // files that have content and aren't removed, by id, after the given one
  abstract listWithContent(
    after: string | null,
    limit: number,
  ): Promise<File[]>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<File | null>;
  // also clears contentStale; false if the file already had this content
  abstract setContentHash(id: string, hash: string): Promise<boolean>;
  abstract markContentStale(id: string): Promise<void>;
  // null if there is no such file
  abstract markRemoved(
    portal: string,
    externalId: string,
  ): Promise<{ id: string; changed: boolean } | null>;
}
