import type { Json } from '@app/plugin-sdk';

export abstract class SyncStateRepository {
  abstract get(portal: string): Promise<Json | null>;
  abstract save(portal: string, state: Json): Promise<void>;
}
