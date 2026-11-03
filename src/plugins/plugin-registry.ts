import { extname } from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, type DiscoverableDecorator } from '@nestjs/core';
import {
  Aggregator,
  Connector,
  ContentProcessor,
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

// 'Application/PDF; charset=binary' → 'application/pdf'
const normalise = (type: string) => type.split(';')[0].trim().toLowerCase();

// Everything the enabled plugins provide, found by their sdk decorators.
// Collected in onModuleInit, when every provider exists, and checked there,
// so a broken plugin stops the app at startup rather than at its first job.
@Injectable()
export class PluginRegistry implements OnModuleInit {
  connectors: ConnectorPlugin[] = [];
  private processors: Plugin<ContentProcessorOptions, ProcessesContent>[] = [];
  private aggregators: Plugin<AggregatorOptions, HandlesMessages>[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    this.connectors = this.find<ConnectorOptions, object>(Connector).map(
      (c) => ({ ...c, mode: c.options.mode }) as ConnectorPlugin,
    );
    this.processors = this.find<ContentProcessorOptions, ProcessesContent>(
      ContentProcessor,
    ).map(({ options, instance }) => ({
      options: { ...options, accepts: options.accepts.map(normalise) },
      instance,
    }));
    this.aggregators = this.find<AggregatorOptions, HandlesMessages>(
      Aggregator,
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
    const mime = file.mime && normalise(file.mime);
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
    // names end up in queue job ids, portals in schedules: unique, no ':'
    const names = [
      ...this.processors.map((p) => p.options.name),
      ...this.aggregators.map((a) => a.options.name),
    ];
    const portals = this.connectors.map((c) => c.options.portal);
    for (const [what, list] of [
      ['plugin name', names],
      ['connector portal', portals],
    ] as const) {
      const dup = list.find((n, i) => list.indexOf(n) !== i);
      if (dup) throw new Error(`${what} "${dup}" is used twice`);
      const bad = list.find((n) => !n || n.includes(':'));
      if (bad !== undefined) throw new Error(`bad ${what} "${bad}"`);
    }

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
