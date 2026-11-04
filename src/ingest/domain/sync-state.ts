import type { Json } from '@app/kernel';

export abstract class SyncStateRepository {
  abstract get(portal: string, account: string): Promise<Json | null>;
  abstract save(portal: string, account: string, state: Json): Promise<void>;
}
