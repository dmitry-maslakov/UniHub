import type { PortalRef } from '../portal-ref.js';
import type { PortalFile } from './portal-file.js';

export abstract class PortalFileRepository {
  // locked against other writes of it until the transaction ends (a sync
  // and its content can't overwrite each other); null if the portal never
  // sent it
  abstract getForUpdate(ref: PortalRef): Promise<PortalFile | null>;
  abstract save(file: PortalFile): Promise<void>;
}
