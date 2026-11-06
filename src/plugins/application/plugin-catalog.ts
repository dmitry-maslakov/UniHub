import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { IdentifiesAccounts, LinksByOAuth, Topic } from '@app/plugin-sdk';
import type { AccountLink, MediaType, PluginName, PortalId } from '@app/kernel';
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

  // the processors on, whose texts are read and found; one turned off keeps
  // its texts stored, out of sight until it's on again
  get processorNames() {
    return this.set.plugins.processors.map(({ spec }) => spec.name);
  }

  // the processors that take this file, each with the entry it matched
  processorsFor(file: { name: string; mime: MediaType | null }) {
    return this.set.plugins.processors.flatMap((processor) => {
      const matched = processor.spec.match(file);
      return matched === null ? [] : [{ processor, matched }];
    });
  }

  // The unpacker that takes this file, with the entry it matched; null if
  // none does. Its extension first, of all of them: one unpacker may take
  // the file's extension and another its media type (an .epub a portal
  // calls application/zip).
  unpackerFor(file: { name: string; mime: MediaType | null }) {
    for (const by of [{ name: file.name, mime: null }, file])
      for (const unpacker of this.set.plugins.unpackers) {
        const matched = unpacker.spec.match(by);
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

  // The connector that links users' own accounts of the portal by `link`,
  // null if none here does: it names other links or none, or the portal is
  // served over gRPC, or by nothing at all.
  linker(portal: PortalId, link: AccountLink): IdentifiesAccounts | null {
    const { polls, pushes } = this.set.plugins;
    const connector = [...polls, ...pushes].find(
      (c) => c.spec.portal === portal,
    );
    if (!connector?.spec.links.includes(link)) return null;
    // its decorator lets only a connector that identifies accounts name
    // links, as it lets only a poll connector be found as one
    return connector.instance as unknown as IdentifiesAccounts;
  }

  // the connector that links accounts of the portal by OAuth, with where
  // its server is, null if none here does
  oauthLinker(portal: PortalId): (IdentifiesAccounts & LinksByOAuth) | null {
    return this.linker(portal, 'oauth') as
      (IdentifiesAccounts & LinksByOAuth) | null;
  }

  get pollConnectors() {
    return this.set.plugins.polls;
  }

  get pushConnectors() {
    return this.set.plugins.pushes;
  }
}
