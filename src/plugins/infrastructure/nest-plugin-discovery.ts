import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper.js';
import { discover, type Discovered } from '@app/plugin-sdk/host.js';
import { PluginDiscovery } from '../application/plugin-discovery.js';
import {
  aggregatorSpec,
  pollSpec,
  ProcessorSpec,
  pushSpec,
} from '../domain/specs.js';

// a transient provider's instance is a placeholder whose constructor never
// ran, a request-scoped one has one per request
function instanceOf<I>(wrapper: InstanceWrapper<I>) {
  if (
    !wrapper.isDependencyTreeStatic() ||
    wrapper.isTransient ||
    !wrapper.instance
  )
    throw new Error(`plugin ${wrapper.name} must be a singleton`);
  return wrapper.instance;
}

const found = <O, S, I>(plugins: Discovered<O, I>[], spec: (o: O) => S) =>
  plugins.map(({ options, wrapper }) => ({
    spec: spec(options),
    instance: instanceOf(wrapper),
  }));

// Plugins are Nest providers carrying the sdk's decorators.
@Injectable()
export class NestPluginDiscovery extends PluginDiscovery {
  constructor(private readonly discovery: DiscoveryService) {
    super();
  }

  find() {
    const { polls, pushes, processors, expanders, aggregators } = discover(
      this.discovery,
    );
    return {
      polls: found(polls, pollSpec),
      pushes: found(pushes, pushSpec),
      processors: found(processors, (o) => ProcessorSpec.of(o)),
      expanders: found(expanders, (o) => ProcessorSpec.of(o)),
      aggregators: found(aggregators, aggregatorSpec),
    };
  }
}
