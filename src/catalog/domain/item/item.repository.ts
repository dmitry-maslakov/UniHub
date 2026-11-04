import type { PortalRef } from '../portal-ref.js';
import type { Item } from './item.js';

export abstract class ItemRepository {
  // locked against other writes of it until the transaction ends; null if
  // the portal never sent it
  abstract getForUpdate(ref: PortalRef): Promise<Item | null>;
  // for a file that names it: read, not locked
  abstract findByRef(ref: PortalRef): Promise<Item | null>;
  abstract save(item: Item): Promise<void>;
}
