import type {
  HandlesMessages,
  PollsPortal,
  ProcessesContent,
  PushesFromPortal,
  Topic,
  UnpacksContent,
} from '@app/plugin-sdk';
import type {
  AggregatorSpec,
  PollSpec,
  ProcessorSpec,
  PushSpec,
  UnpackerSpec,
} from '../domain/specs.js';

export interface Plugin<S, I> {
  spec: S;
  instance: I;
}

export interface Found {
  polls: Plugin<PollSpec, PollsPortal>[];
  pushes: Plugin<PushSpec, PushesFromPortal>[];
  processors: Plugin<ProcessorSpec, ProcessesContent>[];
  unpackers: Plugin<UnpackerSpec, UnpacksContent>[];
  aggregators: Plugin<AggregatorSpec<Topic>, HandlesMessages>[];
}

// The plugins of the enabled modules, their specs checked. Asked once every
// provider exists.
export abstract class PluginDiscovery {
  abstract find(): Found;
}
