import type {
  ExpandsContent,
  HandlesMessages,
  PollsPortal,
  ProcessesContent,
  PushesFromPortal,
  Topic,
} from '@app/plugin-sdk';
import type {
  AggregatorSpec,
  PollSpec,
  ProcessorSpec,
  PushSpec,
} from '../domain/specs.js';

export interface Plugin<S, I> {
  spec: S;
  instance: I;
}

export interface Found {
  polls: Plugin<PollSpec, PollsPortal>[];
  pushes: Plugin<PushSpec, PushesFromPortal>[];
  processors: Plugin<ProcessorSpec, ProcessesContent>[];
  // an expander's spec is as a processor's
  expanders: Plugin<ProcessorSpec, ExpandsContent>[];
  aggregators: Plugin<AggregatorSpec<Topic>, HandlesMessages>[];
}

// The plugins of the enabled modules, their specs checked. Asked once every
// provider exists.
export abstract class PluginDiscovery {
  abstract find(): Found;
}
