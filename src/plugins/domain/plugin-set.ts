import type { PluginName, PortalId } from '@app/kernel';
import { PortalHasTwoWritersError, UsedTwiceError } from './errors.js';

// what the rules look at in each plugin found
interface Found {
  polls: readonly { spec: { portal: PortalId } }[];
  pushes: readonly { spec: { portal: PortalId } }[];
  processors: readonly { spec: { name: PluginName } }[];
  unpackers: readonly {
    spec: { name: PluginName; takes: readonly string[] };
  }[];
  aggregators: readonly { spec: { name: PluginName } }[];
}

const unique = (what: string, values: readonly string[]) => {
  const twice = values.find((value, i) => values.indexOf(value) !== i);
  if (twice !== undefined) throw new UsedTwiceError(what, twice);
};

// The enabled plugins, as the hub can run them. A plugin's name is its key
// in job ids and stored results, so one per plugin; a portal has one writer,
// in-process or over gRPC, or two would overwrite each other's records and
// state; a format has one unpacker, or a container would have two trees.
export class PluginSet<F extends Found> {
  private constructor(readonly plugins: F) {}

  static of<F extends Found>(found: F, external: readonly PortalId[]) {
    const connectors = [...found.polls, ...found.pushes];
    unique(
      'plugin name',
      [...found.processors, ...found.unpackers, ...found.aggregators].map(
        (p) => p.spec.name,
      ),
    );
    // one unpacker may list a format twice ('.zip', '.ZIP')
    unique(
      'unpacked format',
      found.unpackers.flatMap((u) => [...new Set(u.spec.takes)]),
    );
    unique(
      'connector portal',
      connectors.map((c) => c.spec.portal),
    );
    const both = connectors.find((c) => external.includes(c.spec.portal));
    if (both) throw new PortalHasTwoWritersError(both.spec.portal);
    return new PluginSet(found);
  }
}
