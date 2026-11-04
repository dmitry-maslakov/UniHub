import type { Readable } from 'node:stream';
import type { CourseRecord, FileRecord, ItemRecord, Json } from './records.js';

// Connectors bring data in from a portal. One is written for one account;
// the hub runs it once per account.
// poll: the hub calls poll() on the connector's schedule, never two runs of
//       one account at once.
// push: the connector keeps its own connection (websocket, long poll...); the
//       hub only calls start() and stop(). Webhooks will come with the first
//       connector that needs them.

export interface PollConnectorOptions {
  portal: string;
  // a cron pattern, e.g. '*/15 * * * *'
  schedule: string;
}

export interface PushConnectorOptions {
  portal: string;
}

export interface ConnectorContext {
  // 'shared' for portals everyone sees the same; per-user accounts later
  account: string;
  // bound to the connector's portal and account
  ingest: PortalIngest;
}

export interface PollsPortal {
  poll(ctx: ConnectorContext): Promise<void>;
}

export interface PushesFromPortal {
  start(ctx: ConnectorContext): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface PortalIngest {
  course(record: CourseRecord): Promise<{ changed: boolean }>;
  item(record: ItemRecord): Promise<{ changed: boolean }>;
  // needsContent: the hub has no content for it yet, or it may have changed.
  // False for a size past the hub's limit for one file, which content()
  // would refuse
  file(
    record: FileRecord,
  ): Promise<{ changed: boolean; needsContent: boolean }>;
  // content of a file already sent with file(). Past the hub's limit for one
  // file it is an InvalidRecordError (CONTENT_TOO_LARGE), and so is every
  // resend: send it again only once file() answers changed for that file
  content(
    fileExternalId: string,
    content: Readable,
  ): Promise<{ hash: string; changed: boolean }>;
  // gone from the portal; sending it again brings it back.
  // Courses can't be removed yet.
  removeItem(externalId: string): Promise<{ changed: boolean }>;
  removeFile(externalId: string): Promise<{ changed: boolean }>;
  // whatever the connector saved on its previous run
  state(): Promise<Json | null>;
  saveState(state: Json): Promise<void>;
}
