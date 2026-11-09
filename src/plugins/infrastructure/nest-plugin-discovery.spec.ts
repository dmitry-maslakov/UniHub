import { Injectable, Scope, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  Aggregator,
  ContentProcessor,
  ITEM_INGESTED,
  PollConnector,
  PushConnector,
} from '@app/plugin-sdk';
import { NestPluginDiscovery } from './nest-plugin-discovery.js';

@PollConnector({ portal: 'moodle', schedule: '*/15 * * * *' })
@Injectable()
class Poller {
  async poll() {}
}

@PushConnector({ portal: 'teams', links: ['token'], instances: true })
@Injectable()
class Pusher {
  async run() {}
  async identify() {
    return { id: '7', expiresAt: null };
  }
  configuredInstance() {
    return null;
  }
}

@ContentProcessor({ name: 'pdf', version: 2, accepts: ['.PDF'] })
@Injectable()
class Pdf {
  async process() {
    return { parts: [] };
  }
}

@Aggregator({ name: 'feed', topics: [ITEM_INGESTED] })
@Injectable({ scope: Scope.TRANSIENT })
class TransientFeed {
  async handle() {}
}

@Aggregator({ name: 'feed', topics: [ITEM_INGESTED] })
@Injectable({ scope: Scope.REQUEST })
class RequestFeed {
  async handle() {}
}

// Nest itself finds the providers, as it does in the app
async function discovery(...plugins: Provider[]) {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [NestPluginDiscovery, ...plugins],
  }).compile();
  return module.get(NestPluginDiscovery);
}

describe('NestPluginDiscovery', () => {
  it('finds the plugins by their decorators, with their specs checked', async () => {
    const found = (await discovery(Poller, Pusher, Pdf)).find();

    expect(found.polls.map(({ spec }) => spec)).toEqual([
      {
        portal: 'moodle',
        schedule: '*/15 * * * *',
        links: [],
        instances: false,
        catalog: false,
      },
    ]);
    expect(found.pushes.map(({ spec }) => spec)).toEqual([
      { portal: 'teams', links: ['token'], instances: true },
    ]);
    expect(found.polls[0].instance).toBeInstanceOf(Poller);
    expect(found.pushes[0].instance).toBeInstanceOf(Pusher);
    const [pdf] = found.processors;
    expect([pdf.spec.name, pdf.spec.version]).toEqual(['pdf', 2]);
    expect(pdf.spec.match({ name: 'a.pdf', mime: null })).toBe('.PDF');
    expect(found.aggregators).toEqual([]);
  });

  it('refuses a plugin that is not one instance', async () => {
    for (const plugin of [TransientFeed, RequestFeed]) {
      const found = discovery(plugin).then((d) => d.find());
      await expect(found).rejects.toThrow(
        `plugin ${plugin.name} must be a singleton`,
      );
    }
  });
});
