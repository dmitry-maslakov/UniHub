import type { ContentHash, PortalId } from '@app/kernel';

// What catalog tells the rest of the hub when its data actually changed.
// Aggregates record them; the repository writes them to the outbox in the
// transaction that saves the change, so one can't happen without the other.

export const ITEM_CHANGED = 'catalog.item-changed';
export const ITEM_REMOVED = 'catalog.item-removed';
export const FILE_CONTENT_CHANGED = 'catalog.file-content-changed';
export const FILE_REMOVED = 'catalog.file-removed';

export type CatalogEvent =
  | {
      topic: typeof ITEM_CHANGED;
      payload: { portal: PortalId; itemId: string };
    }
  | {
      topic: typeof ITEM_REMOVED;
      payload: { portal: PortalId; itemId: string };
    }
  | {
      topic: typeof FILE_CONTENT_CHANGED;
      payload: { portal: PortalId; fileId: string; hash: ContentHash };
    }
  | {
      topic: typeof FILE_REMOVED;
      payload: { portal: PortalId; fileId: string };
    };
