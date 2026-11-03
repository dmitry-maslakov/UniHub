export type Json =
  string | number | boolean | null | Json[] | { [key: string]: Json };

export abstract class SyncStateRepository {
  abstract get(portal: string, account: string): Promise<Json | null>;
  abstract save(portal: string, account: string, state: Json): Promise<void>;
}
