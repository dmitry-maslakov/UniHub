import {
  FILE_CONTENT_STORED,
  FILE_REMOVED,
  ITEM_INGESTED,
  ITEM_REMOVED,
  type Message,
} from '@app/plugin-sdk';
import * as catalog from '../../catalog/contracts.js';

// Catalog's events are internal; plugins get the sdk's messages, so the two
// can change apart. A topic with no sdk message isn't for plugins.
export function toSdkMessage(topic: string, payload: unknown): Message | null {
  switch (topic) {
    case catalog.ITEM_CHANGED: {
      const { portal, itemId } = payload as catalog.ItemChanged;
      return { topic: ITEM_INGESTED, payload: { portal, itemId } };
    }
    case catalog.ITEM_REMOVED: {
      const { portal, itemId } = payload as catalog.ItemRemoved;
      return { topic: ITEM_REMOVED, payload: { portal, itemId } };
    }
    case catalog.FILE_CONTENT_CHANGED: {
      const { portal, fileId, hash } = payload as catalog.FileContentChanged;
      return { topic: FILE_CONTENT_STORED, payload: { portal, fileId, hash } };
    }
    case catalog.FILE_REMOVED: {
      const { portal, fileId } = payload as catalog.FileRemoved;
      return { topic: FILE_REMOVED, payload: { portal, fileId } };
    }
    default:
      return null;
  }
}
