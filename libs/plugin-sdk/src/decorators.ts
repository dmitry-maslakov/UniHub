import type { AccountLink } from '@app/kernel';
import type { IdentifiesAccounts, LinksByOAuth } from './accounts.js';
import type { AggregatorOptions, HandlesMessages } from './aggregators.js';
import type {
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
// connector without poll(), one that names links without identify(), or an
// aggregator that doesn't handle every topic it listens to, doesn't compile.

type Class<T> = abstract new (...args: any[]) => T;

// what a connector implements for the links it names: none, nothing more;
// OAuth, its server and how it revokes too
type Linking<L extends AccountLink> = [L] extends [never]
  ? unknown
  : IdentifiesAccounts &
      ([Extract<L, 'oauth'>] extends [never] ? unknown : LinksByOAuth);

export function PollConnector<L extends AccountLink = never>(
  options: PollConnectorOptions<L>,
) {
  return <C extends Class<PollsPortal & Linking<L>>>(target: C) => {
    PollConnectorMark(options)(target);
  };
}

export function PushConnector<L extends AccountLink = never>(
  options: PushConnectorOptions<L>,
) {
  return <C extends Class<PushesFromPortal & Linking<L>>>(target: C) => {
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
