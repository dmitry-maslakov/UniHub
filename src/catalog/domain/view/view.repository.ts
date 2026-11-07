import type { Json, MediaType } from '@app/kernel';
import type { PortalSite } from '../portal-ref.js';
import type { Shown } from '../publication.js';
import type { Sighting, ViewChange } from './view.js';

// What a user's account saw of each kind of record, as its version holds
// it: the record's hub ids in place of the portal's
export interface VersionData {
  course: { name: string; url: string | null; meta: Json | null };
  item: {
    portalCourseId: string;
    kind: string;
    title: string | null;
    url: string | null;
    publishedAt: Date | null;
    raw: Json;
  };
  file: {
    portalCourseId: string;
    itemId: string | null;
    name: string;
    path: string;
    url: string | null;
    size: number | null;
    mime: MediaType | null;
    sourceUpdatedAt: Date | null;
  };
}
export type Kind = keyof VersionData;

// Users' accounts' views: versions shared by the accounts that see a record
// alike, never changed, and each account's sights of them. In a
// transaction: a version made writes its event to the outbox with it (a
// post's ITEM_CHANGED; a file's FILE_CONTENT_CHANGED, when its bytes are the
// hub's already).
export abstract class ViewRepository {
  // the hub's ids for these records of the portal's site, made for the new
  // ones unless `make` is false
  abstract recordIds(
    kind: Kind,
    site: PortalSite,
    externalIds: readonly string[],
    make?: boolean,
  ): Promise<Map<string, string>>;
  // the record's version of this fingerprint, made if no account saw it so
  // before
  abstract versionOf<K extends Kind>(
    kind: K,
    recordId: string,
    fingerprint: string,
    data: VersionData[K],
  ): Promise<string>;
  // the versions the account sees now, of a course's posts or files, or of
  // its courses
  abstract sightings(
    kind: Kind,
    account: string,
    portalCourseId: string | null,
  ): Promise<Sighting[]>;
  abstract apply(
    kind: Kind,
    account: string,
    change: ViewChange,
    at: Shown,
  ): Promise<void>;
  // the account's view shows from `from`, unless it did from earlier:
  // since when it shows is the earliest a listing of it showed from
  abstract showsFrom(account: string, from: Date): Promise<void>;
  // an account gone: its sights and since when its view shows, so nothing
  // of what it saw stays; what no other account sees then is removed (its
  // event to the outbox)
  abstract forget(account: string): Promise<void>;
  // the bytes of a file at a size and date as the portal gave them, for
  // every user's account's version of it there that has none yet; whether
  // any had none
  abstract storeBytes(
    fileId: string,
    stamp: Stamp,
    hash: string,
  ): Promise<boolean>;
}

// what the portal says of a file's bytes: a version of them
export interface Stamp {
  size: number | null;
  sourceUpdatedAt: Date | null;
}
