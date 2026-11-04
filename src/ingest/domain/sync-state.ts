import type { Json } from '@app/kernel';
import type { Connection } from './connection.js';

// what a connector saved on its previous run, null when it never saved one
export abstract class SyncStateRepository {
  abstract get(connection: Connection): Promise<Json | null>;
  abstract save(connection: Connection, state: Json): Promise<void>;
}
