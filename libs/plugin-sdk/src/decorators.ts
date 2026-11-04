import type { AggregatorOptions, HandlesMessages } from './aggregators.js';
import type {
  PollConnectorOptions,
  PollsPortal,
  PushConnectorOptions,
  PushesFromPortal,
} from './connectors.js';
import {
  AggregatorMark,
  ContentProcessorMark,
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
// connector without poll(), or an aggregator that doesn't handle every
// topic it listens to, doesn't compile.

type Class<T> = abstract new (...args: any[]) => T;

export function PollConnector(options: PollConnectorOptions) {
  return <C extends Class<PollsPortal>>(target: C) => {
    PollConnectorMark(options)(target);
  };
}

export function PushConnector(options: PushConnectorOptions) {
  return <C extends Class<PushesFromPortal>>(target: C) => {
    PushConnectorMark(options)(target);
  };
}

export function ContentProcessor(options: ContentProcessorOptions) {
  return <C extends Class<ProcessesContent>>(target: C) => {
    ContentProcessorMark(options)(target);
  };
}

export function Aggregator<T extends Topic>(options: AggregatorOptions<T>) {
  return <C extends Class<HandlesMessages<T>>>(target: C) => {
    AggregatorMark(options)(target);
  };
}
