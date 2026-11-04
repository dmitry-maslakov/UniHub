import type { ContentHash, PortalId } from '@app/kernel';

// What the hub tells plugins when something actually changed (not on every
// resend). Topic names and payloads are part of the contract.

export interface ItemIngested {
  portal: PortalId;
  itemId: string;
}

export interface ItemRemoved {
  portal: PortalId;
  itemId: string;
}

export interface FileContentStored {
  portal: PortalId;
  fileId: string;
  hash: ContentHash;
}

export interface FileRemoved {
  portal: PortalId;
  fileId: string;
}

export interface Messages {
  'item.ingested': ItemIngested;
  'item.removed': ItemRemoved;
  'file.content-stored': FileContentStored;
  'file.removed': FileRemoved;
}

export type Topic = keyof Messages;

// a message of one of these topics, any by default; switch on `topic` and
// the payload type follows
export type Message<T extends Topic = Topic> = {
  [K in T]: { topic: K; payload: Messages[K] };
}[T];

export const ITEM_INGESTED = 'item.ingested' satisfies Topic;
export const ITEM_REMOVED = 'item.removed' satisfies Topic;
export const FILE_CONTENT_STORED = 'file.content-stored' satisfies Topic;
export const FILE_REMOVED = 'file.removed' satisfies Topic;
