import type { Upserted } from './changes.js';

// what we know about a file; the content itself lives in storage
export interface File {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: string | null;
  sourceUpdatedAt: Date | null;
  contentHash: string | null;
}

type Optional =
  | 'portalCourseId'
  | 'itemId'
  | 'path'
  | 'url'
  | 'size'
  | 'mime'
  | 'sourceUpdatedAt';

// contentHash isn't the portal's to set, storage fills it in
export type FileData = Omit<File, 'id' | 'contentHash' | Optional> &
  Partial<Pick<File, Optional>>;

export abstract class FileRepository {
  abstract upsert(data: FileData): Promise<Upserted<File>>;
  abstract findById(id: string): Promise<File | null>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<File | null>;
  // false if the file already had this content
  abstract setContentHash(id: string, hash: string): Promise<boolean>;
}
