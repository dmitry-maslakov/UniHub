// What the hub publishes when something actually changed (not on every
// resend). Topic names are part of the contract, payloads are plain json.

export const ITEM_INGESTED = 'item.ingested';

export interface ItemIngested {
  portal: string;
  itemId: string;
}

export const FILE_CONTENT_STORED = 'file.content-stored';

export interface FileContentStored {
  portal: string;
  fileId: string;
  hash: string;
}
