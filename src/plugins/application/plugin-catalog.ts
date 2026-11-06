import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Topic } from '@app/plugin-sdk';
import type { MediaType, PluginName, PortalId } from '@app/kernel';
import { ConnectorTokens } from '../../ingest/contracts.js';
import { PluginSet } from '../domain/plugin-set.js';
import { PluginDiscovery, type Found } from './plugin-discovery.js';

// The enabled plugins, by what the hub looks them up by.
@Injectable()
export class PluginCatalog implements OnModuleInit {
  private set: PluginSet<Found>;

  constructor(
    private readonly discovery: PluginDiscovery,
    private readonly tokens: ConnectorTokens,
  ) {}

  // once every provider exists; a broken plugin stops the app at startup
  // rather than at its first job
  onModuleInit() {
    this.set = PluginSet.of(this.discovery.find(), this.tokens.portals());
  }

  // by name, for running a queued job
  processor(name: PluginName) {
    return this.set.plugins.processors.find((p) => p.spec.name === name);
  }

  unpacker(name: PluginName) {
    return this.set.plugins.unpackers.find((u) => u.spec.name === name);
  }

  aggregator(name: PluginName) {
    return this.set.plugins.aggregators.find((a) => a.spec.name === name);
  }

  // the processors that take this file, each with the entry it matched
  processorsFor(file: { name: string; mime: MediaType | null }) {
    return this.set.plugins.processors.flatMap((processor) => {
      const matched = processor.spec.match(file);
      return matched === null ? [] : [{ processor, matched }];
    });
  }

  // the one unpacker that takes this file, with the entry it matched; null
  // if none does
  unpackerFor(file: { name: string; mime: MediaType | null }) {
    for (const unpacker of this.set.plugins.unpackers) {
      const matched = unpacker.spec.match(file);
      if (matched !== null) return { unpacker, matched };
    }
    return null;
  }

  aggregatorsFor(topic: Topic) {
    return this.set.plugins.aggregators.filter((a) =>
      a.spec.topics.includes(topic),
    );
  }

  pollConnector(portal: PortalId) {
    return this.set.plugins.polls.find((c) => c.spec.portal === portal);
  }

  get pollConnectors() {
    return this.set.plugins.polls;
  }

  get pushConnectors() {
    return this.set.plugins.pushes;
  }
}
