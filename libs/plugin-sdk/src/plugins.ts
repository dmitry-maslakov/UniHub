import type { Readable } from 'node:stream';
import { DiscoveryService } from '@nestjs/core';
import type { Message, Topic } from './messages.js';
import type { CourseRecord, FileRecord, ItemRecord, Json } from './records.js';

// A plugin is an ordinary Nest module in this repo whose providers carry one
// of these decorators; it imports only this sdk, never the hub. Providers
// must be singletons. Anything outside the repo talks to the hub over gRPC.
// Names (and portals) are unique and can't contain ':'.

// ---- connectors: bring data in from a portal
//
// A connector is written for one account; the hub runs it once per account.
// poll: the hub calls poll() on the connector's schedule, never two runs of
//       one account at once.
// push: the connector keeps its own connection (websocket, long poll...); the
//       hub only calls start() and stop(). Webhooks will come with the first
//       connector that needs them.

export type ConnectorOptions =
  // schedule is a cron pattern, e.g. '*/15 * * * *'
  | { portal: string; mode: 'poll'; schedule: string }
  | { portal: string; mode: 'push' };

export const Connector = DiscoveryService.createDecorator<ConnectorOptions>();

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
  // needsContent: the hub has no content for it yet, or it may have changed
  file(
    record: FileRecord,
  ): Promise<{ changed: boolean; needsContent: boolean }>;
  // content of a file already sent with file()
  content(
    fileExternalId: string,
    content: Readable,
  ): Promise<{ hash: string; changed: boolean }>;
  // gone from the portal; sending it again brings it back.
  // Courses can't be removed yet.
  remove(
    kind: 'item' | 'file',
    externalId: string,
  ): Promise<{ changed: boolean }>;
  // whatever the connector saved on its previous run
  state(): Promise<Json | null>;
  saveState(state: Json): Promise<void>;
}

// ---- reading what the hub has, by the hub's ids from messages

export interface CourseView {
  id: string;
  portal: string;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface ItemView {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
  removed: boolean;
}

export interface FileView {
  id: string;
  portal: string;
  externalId: string;
  portalCourseId: string | null;
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: string | null;
  contentHash: string | null;
  removed: boolean;
}

// provided by the hub, inject it in a plugin
export abstract class HubReader {
  abstract course(id: string): Promise<CourseView | null>;
  abstract item(id: string): Promise<ItemView | null>;
  abstract file(id: string): Promise<FileView | null>;
  abstract content(hash: string): Promise<Readable>;
}

// ---- content processors: turn a file into text a model can read

export interface ContentProcessorOptions {
  name: string;
  // bump it when the output changes, so stored results get redone
  version: number;
  // mime types ('application/pdf') or extensions ('.pdf'), any case
  accepts: string[];
}

export const ContentProcessor =
  DiscoveryService.createDecorator<ContentProcessorOptions>();

export interface ProcessorInput {
  name: string;
  mime: string | null;
  hash: string;
  // a fresh stream on every call, closed by the hub after the run
  content(): Promise<Readable>;
}

// text split the way the source is split: pages of a pdf, slides of a deck
export interface Representation {
  parts: string[];
}

// Processors and aggregators get each message at least once and in no
// particular order: the same message can come again after a failure, and an
// item.ingested can arrive after the item.removed that followed it. Handle a
// message so that doing it twice is harmless, and read the current state
// through HubReader rather than trusting the message alone.

export interface ProcessesContent {
  process(input: ProcessorInput): Promise<Representation>;
}

// ---- aggregators: react to what came in and build their own data

export interface AggregatorOptions {
  name: string;
  topics: Topic[];
}

export const Aggregator = DiscoveryService.createDecorator<AggregatorOptions>();

export interface HandlesMessages {
  handle(message: Message): Promise<void>;
}
