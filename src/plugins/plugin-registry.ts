import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DiscoveryService, type DiscoverableDecorator } from '@nestjs/core';
import {
  Aggregator,
  Connector,
  ContentProcessor,
  type AggregatorOptions,
  type ConnectorOptions,
  type ContentProcessorOptions,
  type HandlesMessages,
  type ProcessesContent,
} from '@app/plugin-sdk';

export interface Plugin<O, I = unknown> {
  options: O;
  instance: I;
}

// Everything the enabled plugins provide, found by their sdk decorators.
// Looked up lazily: providers are only all there once the app has started.
@Injectable()
export class PluginRegistry {
  private found?: {
    connectors: Plugin<ConnectorOptions>[];
    processors: Plugin<ContentProcessorOptions, ProcessesContent>[];
    aggregators: Plugin<AggregatorOptions, HandlesMessages>[];
  };

  constructor(private readonly discovery: DiscoveryService) {}

  get connectors() {
    return this.all().connectors;
  }

  processorsFor(file: { name: string; mime: string | null }) {
    const ext = extname(file.name).toLowerCase();
    return this.all().processors.filter(({ options }) =>
      options.accepts.some((a) => a === file.mime || a === ext),
    );
  }

  aggregatorsFor(topic: string) {
    return this.all().aggregators.filter(({ options }) =>
      options.topics.includes(topic),
    );
  }

  private all() {
    this.found ??= {
      connectors: this.find(Connector),
      processors: this.find<ContentProcessorOptions, ProcessesContent>(
        ContentProcessor,
      ),
      aggregators: this.find<AggregatorOptions, HandlesMessages>(Aggregator),
    };
    return this.found;
  }

  private find<O, I>(decorator: DiscoverableDecorator<O>) {
    return this.discovery
      .getProviders({ metadataKey: decorator.KEY })
      .filter((wrapper) => wrapper.instance)
      .map((wrapper) => ({
        options: this.discovery.getMetadataByDecorator(decorator, wrapper) as O,
        instance: wrapper.instance as I,
      }));
  }
}
