import type {
  HandlesMessages,
  PollsPortal,
  ProcessesContent,
  PushesFromPortal,
  Topic,
} from '@app/plugin-sdk';
import { PortalId } from '@app/kernel';
import type { ConnectorTokens } from '../../ingest/contracts.js';
import {
  aggregatorSpec,
  pollSpec,
  ProcessorSpec,
  pushSpec,
} from '../domain/specs.js';
import { PluginCatalog } from './plugin-catalog.js';
import type { Found } from './plugin-discovery.js';

// Plugins as discovery would find them, for the specs.

export const poll = (
  portal: string,
  instance: PollsPortal = { poll: async () => {} },
) => ({ spec: pollSpec({ portal, schedule: '0 0 1 1 *' }), instance });

export const push = (portal: string, instance: PushesFromPortal) => ({
  spec: pushSpec({ portal }),
  instance,
});

export const processor = (
  name: string,
  accepts: string[],
  instance: ProcessesContent = { process: async () => ({ parts: [] }) },
) => ({ spec: ProcessorSpec.of({ name, version: 1, accepts }), instance });

export const aggregator = (
  name: string,
  topics: Topic[],
  instance: HandlesMessages = { handle: async () => {} },
) => ({ spec: aggregatorSpec({ name, topics }), instance });

// the catalog of these plugins once the app's modules are up; `external`
// are the portals with gRPC tokens
export function catalogOf(found: Partial<Found>, external: string[] = []) {
  const all = { polls: [], pushes: [], processors: [], aggregators: [] };
  const tokens = { portals: () => external.map((p) => PortalId.parse(p)) };
  const catalog = new PluginCatalog(
    { find: () => ({ ...all, ...found }) },
    tokens as unknown as ConnectorTokens,
  );
  catalog.onModuleInit();
  return catalog;
}
