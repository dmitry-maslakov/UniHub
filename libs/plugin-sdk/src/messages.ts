// What the hub tells plugins when something actually changed (not on every
// resend). Topic names and payloads are part of the contract.

export interface ItemIngested {
  portal: string;
  itemId: string;
}

export interface ItemRemoved {
  portal: string;
  itemId: string;
}

export interface FileContentStored {
  portal: string;
  fileId: string;
  hash: string;
}

export interface FileRemoved {
  portal: string;
  fileId: string;
}

export interface Messages {
  'item.ingested': ItemIngested;
  'item.removed': ItemRemoved;
  'file.content-stored': FileContentStored;
  'file.removed': FileRemoved;
}

export type Topic = keyof Messages;

// switch on `topic` and the payload type follows
export type Message = {
  [T in Topic]: { topic: T; payload: Messages[T] };
}[Topic];

export const ITEM_INGESTED = 'item.ingested' satisfies Topic;
export const ITEM_REMOVED = 'item.removed' satisfies Topic;
export const FILE_CONTENT_STORED = 'file.content-stored' satisfies Topic;
export const FILE_REMOVED = 'file.removed' satisfies Topic;
