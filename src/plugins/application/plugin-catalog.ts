import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { HasInstances, IdentifiesAccounts, Topic } from '@app/plugin-sdk';
import {
  Instance,
  InvalidValueError,
  NO_INSTANCE,
  type AccountLink,
  type MediaType,
  type PluginName,
  type PortalId,
} from '@app/kernel';
import { ConnectorTokens } from '../../ingest/contracts.js';
import { PluginSet } from '../domain/plugin-set.js';
import { PluginDiscovery, type Found } from './plugin-discovery.js';

// The enabled plugins, by what the hub looks them up by.
@Injectable()
export class PluginCatalog implements OnModuleInit {
  private set: PluginSet<Found>;
  // the site each portal with sites is read at by its own settings
  private configured: ReadonlyMap<PortalId, Instance>;

  constructor(
    private readonly discovery: PluginDiscovery,
    private readonly tokens: ConnectorTokens,
  ) {}

  // once every provider exists; a broken plugin stops the app at startup
  // rather than at its first job
  onModuleInit() {
    this.set = PluginSet.of(this.discovery.find(), this.tokens.portals());
    this.configured = new Map(
      this.connectors
        .filter(({ spec }) => spec.instances)
        .flatMap(({ spec, instance }) => {
          // its decorator lets only a connector that says it name instances
          const url = (
            instance as unknown as HasInstances
          ).configuredInstance();
          if (url === null) return [];
          const site = Instance.safeParse(url);
          if (!site.success)
            throw new InvalidValueError(`${spec.portal}'s instance`, url);
          return [[spec.portal, site.data] as const];
        }),
    );
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
    const connector = this.connectorOf(portal);
    if (!connector?.spec.links.includes(link)) return null;
    // its decorator lets only a connector that identifies accounts name
    // links, as it lets only a poll connector be found as one
    return connector.instance as unknown as IdentifiesAccounts;
  }

  // whether the portal's connector runs outside the hub, over gRPC
  external(portal: PortalId) {
    return this.tokens.portals().includes(portal);
  }

  // whether the portal is a site per school (its connector says so): an
  // account of it is linked with its site's address
  hasInstances(portal: PortalId) {
    return this.connectorOf(portal)?.spec.instances ?? false;
  }

  // The site the portal's own settings read (its connector's
  // configuredInstance(), CANVAS_URL): the shared account's, and that of
  // an account linked before accounts kept theirs. None for a portal of
  // one site, or settings that name none.
  configuredInstance(portal: PortalId) {
    return this.configured.get(portal) ?? NO_INSTANCE;
  }

  // every portal whose settings name its site, and that site
  get configuredInstances() {
    return [...this.configured].map(([portal, instance]) => ({
      portal,
      instance,
    }));
  }

  private get connectors() {
    const { polls, pushes } = this.set.plugins;
    return [...polls, ...pushes];
  }

  private connectorOf(portal: PortalId) {
    return this.connectors.find((c) => c.spec.portal === portal);
  }

  get pollConnectors() {
    return this.set.plugins.polls;
  }

  get pushConnectors() {
    return this.set.plugins.pushes;
  }
}
