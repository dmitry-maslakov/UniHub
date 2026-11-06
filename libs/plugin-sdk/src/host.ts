import { DiscoveryService, type DiscoverableDecorator } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import type { AggregatorOptions, HandlesMessages } from './aggregators.js';
import type {
  PollConnectorOptions,
  PollsPortal,
  PushConnectorOptions,
  PushesFromPortal,
} from './connectors.js';
import type { ContentExpanderOptions, ExpandsContent } from './expanders.js';
import type {
  ContentProcessorOptions,
  ProcessesContent,
} from './processors.js';

// The hub's side of the decorators: the marks it finds plugins by. Not
// exported from index.ts; plugins never need it, and a lint rule keeps them
// out of it.

export const PollConnectorMark =
  DiscoveryService.createDecorator<PollConnectorOptions>();
export const PushConnectorMark =
  DiscoveryService.createDecorator<PushConnectorOptions>();
export const ContentProcessorMark =
  DiscoveryService.createDecorator<ContentProcessorOptions>();
export const ContentExpanderMark =
  DiscoveryService.createDecorator<ContentExpanderOptions>();
export const AggregatorMark =
  DiscoveryService.createDecorator<AggregatorOptions>();

export interface Discovered<O, I> {
  options: O;
  // Nest's provider, for the hub to check it is one instance
  wrapper: InstanceWrapper<I>;
}

// Every provider a plugin decorator marked, with what the decorator said.
// Each decorator only fits classes of its kind, so the mark a provider was
// found by says what its instance is.
export function discover(discovery: DiscoveryService) {
  const find = <O, I>(mark: DiscoverableDecorator<O>): Discovered<O, I>[] =>
    discovery.getProviders({ metadataKey: mark.KEY }).map((wrapper) => ({
      // found by this mark, so it has its metadata
      options: discovery.getMetadataByDecorator(mark, wrapper)!,
      wrapper,
    }));
  return {
    polls: find<PollConnectorOptions, PollsPortal>(PollConnectorMark),
    pushes: find<PushConnectorOptions, PushesFromPortal>(PushConnectorMark),
    processors: find<ContentProcessorOptions, ProcessesContent>(
      ContentProcessorMark,
    ),
    expanders: find<ContentExpanderOptions, ExpandsContent>(
      ContentExpanderMark,
    ),
    aggregators: find<AggregatorOptions, HandlesMessages>(AggregatorMark),
  };
}
