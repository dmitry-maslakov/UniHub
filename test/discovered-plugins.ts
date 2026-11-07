import type { ConfigType } from '@nestjs/config';
import type {
  AccountLink,
  Credential,
  HandlesMessages,
  PollsPortal,
  ProcessesContent,
  PushesFromPortal,
  Topic,
  UnpacksContent,
} from '@app/plugin-sdk';
import { NO_INSTANCE, PortalId } from '@app/kernel';
import type {
  ConnectorTokens,
  IngestService,
} from '../src/ingest/contracts.js';
import {
  AccountCredentialQuery,
  PortalReadersQuery,
} from '../src/plugins/application/accounts.js';
import { ConnectionDirectory } from '../src/plugins/application/connection-directory.js';
import type { InstanceAdoption } from '../src/plugins/application/instance-adoption.js';
import { PluginCatalog } from '../src/plugins/application/plugin-catalog.js';
import type { Found } from '../src/plugins/application/plugin-discovery.js';
import {
  aggregatorSpec,
  pollSpec,
  ProcessorSpec,
  pushSpec,
  UnpackerSpec,
} from '../src/plugins/domain/specs.js';
import {
  pluginsSettings,
  type pluginsConfig,
} from '../src/plugins/plugins.config.js';
import { FakeBus } from './fake-bus.js';

// Plugins as discovery would find them, for the unit specs of plugins and
// of processing, which reads them through PluginCatalog.

// `links`: what the connector names in its decorator, which then lets only
// an instance that identifies accounts through; `instances`, that its portal
// is a site per school, which lets only one that says its settings' site
export const poll = (
  portal: string,
  instance: PollsPortal = { poll: async () => {} },
  links: AccountLink[] = [],
  instances = false,
) => ({
  spec: pollSpec({ portal, schedule: '0 0 1 1 *', links, instances }),
  instance,
});

export const push = (
  portal: string,
  instance: PushesFromPortal,
  links: AccountLink[] = [],
) => ({ spec: pushSpec({ portal, links }), instance });

export const processor = (
  name: string,
  accepts: string[],
  instance: ProcessesContent = { process: async () => ({ parts: [] }) },
  version = 1,
) => ({ spec: ProcessorSpec.of({ name, version, accepts }), instance });

export const unpacker = (
  name: string,
  accepts: string[],
  instance: UnpacksContent = { unpack: async function* () {} },
  version = 1,
) => ({ spec: UnpackerSpec.of({ name, version, accepts }), instance });

export const aggregator = (
  name: string,
  topics: Topic[],
  instance: HandlesMessages = { handle: async () => {} },
) => ({ spec: aggregatorSpec({ name, topics }), instance });

// the catalog of these plugins once the app's modules are up; `external`
// are the portals with gRPC tokens
export function catalogOf(found: Partial<Found>, external: string[] = []) {
  const all = {
    polls: [],
    pushes: [],
    processors: [],
    unpackers: [],
    aggregators: [],
  };
  const tokens = { portals: () => external.map((p) => PortalId.parse(p)) };
  const catalog = new PluginCatalog(
    { find: () => ({ ...all, ...found }) },
    tokens as unknown as ConnectorTokens,
  );
  catalog.onModuleInit();
  return catalog;
}

// the plugins' settings as the app reads them, these set
export const pluginSettings = (env: Record<string, string> = {}) =>
  pluginsSettings.parse(env) as ConfigType<typeof pluginsConfig>;

// Who runs are for: the users' own accounts `accounts` names for a portal,
// linked by `credentials` (one with none no longer reads), each reading the
// site its credential names; the shared account of any other portal, at
// the site `catalog`'s connector's settings name. Rows from before sites
// are adopted already.
export const directoryOf = (
  accounts: Record<string, string[]> = {},
  credentials: Record<string, Credential> = {},
  ingest = {} as IngestService,
  catalog = catalogOf({}),
) =>
  new ConnectionDirectory(
    ingest,
    new FakeBus([
      [
        PortalReadersQuery,
        ({ portal }: PortalReadersQuery) =>
          accounts[portal]
            ? { shared: false, accounts: accounts[portal] }
            : { shared: true },
      ],
      [
        AccountCredentialQuery,
        ({ account }: AccountCredentialQuery) =>
          credentials[account]
            ? {
                credential: credentials[account],
                seal: `seal-of-${account}`,
                instance: credentials[account].url ?? NO_INSTANCE,
              }
            : null,
      ],
    ]).queries,
    pluginSettings(),
    catalog,
    { done: async () => {} } as InstanceAdoption,
  );
