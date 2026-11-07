import type { AccountLink } from '@app/kernel';
import type { IdentifiesAccounts } from './accounts.js';
import type { AggregatorOptions, HandlesMessages } from './aggregators.js';
import type {
  HasInstances,
  PollConnectorOptions,
  PollsPortal,
  PushConnectorOptions,
  PushesFromPortal,
} from './connectors.js';
import type { ContentUnpackerOptions, UnpacksContent } from './unpackers.js';
import {
  AggregatorMark,
  ContentProcessorMark,
  ContentUnpackerMark,
  PollConnectorMark,
  PushConnectorMark,
} from './host.js';
import type { Topic } from './messages.js';
import type {
  ContentProcessorOptions,
  ProcessesContent,
} from './processors.js';

// A plugin is an ordinary Nest module in this repo whose providers carry one
// of these decorators; it imports only this sdk, never the hub. Providers
// must be singletons. Names (and portals) are unique, lower-case letters,
// digits and dashes. Connectors outside the repo talk to the hub over gRPC.
//
// Each decorator only fits a class that implements its kind, so a poll
// connector without poll(), one that names links without identify(), one
// of a portal with instances without configuredInstance(), or an aggregator
// that doesn't handle every topic it listens to, doesn't compile.

type Class<T> = abstract new (...args: any[]) => T;

// what a connector implements for the links it names: none, nothing more
type Linking<L extends AccountLink> = [L] extends [never]
  ? unknown
  : IdentifiesAccounts;

// what a connector of a portal with instances implements
type Instancing<I extends boolean> = [I] extends [true]
  ? HasInstances
  : unknown;

export function PollConnector<
  L extends AccountLink = never,
  I extends boolean = false,
>(options: PollConnectorOptions<L, I>) {
  return <C extends Class<PollsPortal & Linking<L> & Instancing<I>>>(
    target: C,
  ) => {
    PollConnectorMark(options)(target);
  };
}

export function PushConnector<
  L extends AccountLink = never,
  I extends boolean = false,
>(options: PushConnectorOptions<L, I>) {
  return <C extends Class<PushesFromPortal & Linking<L> & Instancing<I>>>(
    target: C,
  ) => {
    PushConnectorMark(options)(target);
  };
}

export function ContentProcessor(options: ContentProcessorOptions) {
  return <C extends Class<ProcessesContent>>(target: C) => {
    ContentProcessorMark(options)(target);
  };
}

export function ContentUnpacker(options: ContentUnpackerOptions) {
  return <C extends Class<UnpacksContent>>(target: C) => {
    ContentUnpackerMark(options)(target);
  };
}

export function Aggregator<T extends Topic>(options: AggregatorOptions<T>) {
  return <C extends Class<HandlesMessages<T>>>(target: C) => {
    AggregatorMark(options)(target);
  };
}
