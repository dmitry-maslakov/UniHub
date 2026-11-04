import { extname } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, type DiscoverableDecorator } from '@nestjs/core';
import {
  AggregatorMark,
  ConnectorMark,
  ContentProcessorMark,
  TOPICS,
  type AggregatorOptions,
  type ConnectorOptions,
  type ContentProcessorOptions,
  type HandlesMessages,
  type PollsPortal,
  type ProcessesContent,
  type PushesFromPortal,
  type Topic,
} from '@app/plugin-sdk';
import { MediaType, PluginName, PortalId } from '@app/kernel';
import { ConnectorTokens } from '../ingest/contracts.js';

export interface Plugin<O, I> {
  options: O;
  instance: I;
}

export type ConnectorPlugin =
  | {
      mode: 'poll';
      options: Extract<ConnectorOptions, { mode: 'poll' }>;
      instance: PollsPortal;
    }
  | {
      mode: 'push';
      options: Extract<ConnectorOptions, { mode: 'push' }>;
      instance: PushesFromPortal;
    };

export type Runnable =
  | {
      kind: 'processor';
      plugin: Plugin<ContentProcessorOptions, ProcessesContent>;
    }
  | { kind: 'aggregator'; plugin: Plugin<AggregatorOptions, HandlesMessages> };

// '.PDF' → '.pdf', 'Application/PDF; charset=binary' → 'application/pdf';
// null for an entry that's neither
const normalise = (entry: string) =>
  entry.startsWith('.')
    ? entry.toLowerCase()
    : (MediaType.safeParse(entry).data ?? null);

// Everything the enabled plugins provide, found by their sdk decorators.
// Collected in onModuleInit, when every provider exists, and checked there,
// so a broken plugin stops the app at startup rather than at its first job.
@Injectable()
export class PluginRegistry implements OnModuleInit {
  connectors: ConnectorPlugin[] = [];
  private processors: Plugin<ContentProcessorOptions, ProcessesContent>[] = [];
  private aggregators: Plugin<AggregatorOptions, HandlesMessages>[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly tokens: ConnectorTokens,
  ) {}

  onModuleInit() {
    this.connectors = this.find<ConnectorOptions, object>(ConnectorMark).map(
      (c) => ({ ...c, mode: c.options.mode }) as ConnectorPlugin,
    );
    this.processors = this.find<ContentProcessorOptions, ProcessesContent>(
      ContentProcessorMark,
    ).map(({ options, instance }) => {
      const accepts = options.accepts.map((entry) => {
        const accepted = normalise(entry);
        if (!accepted)
          throw new Error(
            `processor ${options.name} accepts "${entry}": neither an extension nor a media type`,
          );
        return accepted;
      });
      return { options: { ...options, accepts }, instance };
    });
    this.aggregators = this.find<AggregatorOptions, HandlesMessages>(
      AggregatorMark,
    );
    this.check();
  }

  connector(portal: string) {
    return this.connectors.find((c) => c.options.portal === portal);
  }

  // by name, for running a queued job
  runnable(name: string): Runnable | undefined {
    const processor = this.processors.find((p) => p.options.name === name);
    if (processor) return { kind: 'processor', plugin: processor };
    const aggregator = this.aggregators.find((a) => a.options.name === name);
    if (aggregator) return { kind: 'aggregator', plugin: aggregator };
  }

  processorsFor(file: { name: string; mime: string | null }) {
    const ext = extname(file.name).toLowerCase();
    const mime = MediaType.safeParse(file.mime).data;
    return this.processors.filter(({ options }) =>
      options.accepts.some((a) => a === mime || a === ext),
    );
  }

  aggregatorsFor(topic: Topic) {
    return this.aggregators.filter(({ options }) =>
      options.topics.includes(topic),
    );
  }

  private find<O, I>(decorator: DiscoverableDecorator<O>) {
    return this.discovery
      .getProviders({ metadataKey: decorator.KEY })
      .map((wrapper) => {
        // a transient provider has a placeholder instance whose constructor never ran
        if (
          !wrapper.isDependencyTreeStatic() ||
          wrapper.isTransient ||
          !wrapper.instance
        )
          throw new Error(`plugin ${wrapper.name} must be a singleton`);
        return {
          options: this.discovery.getMetadataByDecorator(decorator, wrapper)!,
          instance: wrapper.instance as I,
        };
      });
  }

  private check() {
    // names end up in queue job ids, portals in schedules: unique, and
    // valid names (PluginName, PortalId)
    const names = [
      ...this.processors.map((p) => p.options.name),
      ...this.aggregators.map((a) => a.options.name),
    ];
    const portals = this.connectors.map((c) => c.options.portal);
    for (const [what, list, schema] of [
      ['plugin name', names, PluginName],
      ['connector portal', portals, PortalId],
    ] as const) {
      const dup = list.find((n, i) => list.indexOf(n) !== i);
      if (dup) throw new Error(`${what} "${dup}" is used twice`);
      const bad = list.find((n) => !schema.safeParse(n).success);
      if (bad !== undefined) throw new Error(`bad ${what} "${bad}"`);
    }

    // two writers of one portal would overwrite each other's records and state
    const external = this.tokens.portals();
    const both = external.find((p) => portals.includes(p));
    if (both)
      throw new Error(`portal "${both}" has a connector and a gRPC token`);

    for (const { mode, options, instance } of this.connectors) {
      const needs = mode === 'poll' ? ['poll'] : ['start', 'stop'];
      for (const method of needs)
        if (
          typeof (instance as unknown as Record<string, unknown>)[method] !==
          'function'
        )
          throw new Error(`connector ${options.portal} has no ${method}()`);
    }

    for (const { options } of this.aggregators) {
      const unknown = options.topics.find((t) => !TOPICS.includes(t));
      if (unknown)
        throw new Error(`aggregator ${options.name}: unknown topic ${unknown}`);
    }
  }
}
