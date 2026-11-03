// what catalog tells the rest of the hub when its data actually changed;
// written in the same transaction as the change

export interface ItemChanged {
  portal: string;
  itemId: string;
}

export interface ItemRemoved {
  portal: string;
  itemId: string;
}

export interface FileContentChanged {
  portal: string;
  fileId: string;
  hash: string;
}

export interface FileRemoved {
  portal: string;
  fileId: string;
}

export abstract class CatalogEvents {
  abstract itemChanged(event: ItemChanged): Promise<void>;
  abstract itemRemoved(event: ItemRemoved): Promise<void>;
  abstract fileContentChanged(event: FileContentChanged): Promise<void>;
  abstract fileRemoved(event: FileRemoved): Promise<void>;
}
