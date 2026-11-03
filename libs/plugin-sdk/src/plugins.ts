import type { Readable } from 'node:stream';
import { DiscoveryService } from '@nestjs/core';
import type { CourseRecord, FileRecord, ItemRecord, Json } from './records.js';

// A plugin is an ordinary Nest module whose providers carry one of these
// decorators. The hub finds them on startup, a plugin never imports the hub.

// ---- connectors: bring data in from a portal

export interface ConnectorOptions {
  portal: string;
}

// A connector decides itself when to sync (@Cron from @nestjs/schedule or
// anything else) and sends what it finds through PortalIngest.
export const Connector = DiscoveryService.createDecorator<ConnectorOptions>();

export interface PortalIngest {
  course(record: CourseRecord): Promise<{ changed: boolean }>;
  item(record: ItemRecord): Promise<{ changed: boolean }>;
  file(record: FileRecord): Promise<{ changed: boolean }>;
  // content of a file already sent with file()
  content(
    fileExternalId: string,
    content: Readable,
  ): Promise<{ hash: string; changed: boolean }>;
  // whatever the connector saved on its previous run
  state(): Promise<Json | null>;
  saveState(state: Json): Promise<void>;
}

// provided by the hub, inject it in a connector
export abstract class Ingest {
  abstract forPortal(portal: string): PortalIngest;
}

// ---- content processors: turn a file into text a model can read

export interface ContentProcessorOptions {
  name: string;
  // bump it when the output changes, so stored results get redone
  version: number;
  // mime types ('application/pdf') or extensions ('.pdf')
  accepts: string[];
}

export const ContentProcessor =
  DiscoveryService.createDecorator<ContentProcessorOptions>();

export interface ProcessorInput {
  fileId: string;
  name: string;
  mime: string | null;
  hash: string;
  content(): Promise<Readable>;
}

// text split the way the source is split: pages of a pdf, slides of a deck
export interface Representation {
  parts: string[];
}

export interface ProcessesContent {
  process(input: ProcessorInput): Promise<Representation>;
}

// ---- aggregators: react to what came in and build their own data

export interface AggregatorOptions {
  name: string;
  // topics from messages.ts
  topics: string[];
}

export const Aggregator = DiscoveryService.createDecorator<AggregatorOptions>();

export interface HandlesMessages {
  handle(topic: string, payload: unknown): Promise<void>;
}
