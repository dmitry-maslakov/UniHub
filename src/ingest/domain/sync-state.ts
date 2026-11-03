export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

export abstract class SyncStateRepository {
  abstract get(portal: string): Promise<Json | null>;
  abstract save(portal: string, state: Json): Promise<void>;
}
