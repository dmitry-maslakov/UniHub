import type { DiscoveryService } from '@nestjs/core';
import {
  AggregatorMark,
  ConnectorMark,
  ContentProcessorMark,
} from '@app/plugin-sdk';
import { PluginRegistry } from './plugin-registry.js';

interface Fake {
  key: string;
  options: unknown;
  instance?: object;
  singleton?: boolean;
  transient?: boolean;
}

// DiscoveryService only matters for what it returns, so it's faked here
function registry(...plugins: Fake[]) {
  const discovery = {
    getProviders: ({ metadataKey }: { metadataKey: string }) =>
      plugins
        .filter((p) => p.key === metadataKey)
        .map((p) => ({
          name: 'FakeProvider',
          instance: p.instance ?? {},
          options: p.options,
          isDependencyTreeStatic: () => p.singleton ?? true,
          isTransient: p.transient ?? false,
        })),
    getMetadataByDecorator: (_: unknown, wrapper: { options: unknown }) =>
      wrapper.options,
  } as unknown as DiscoveryService;
  const r = new PluginRegistry(discovery);
  r.onModuleInit();
  return r;
}

const processor = (name: string, accepts = ['.pdf']): Fake => ({
  key: ContentProcessorMark.KEY,
  options: { name, version: 1, accepts },
});
const aggregator = (name: string, topics: string[]): Fake => ({
  key: AggregatorMark.KEY,
  options: { name, topics },
});

describe('PluginRegistry', () => {
  it('matches files by mime type or extension, in any case', () => {
    const r = registry(processor('pdf', ['Application/PDF', '.PDF']));
    const names = (name: string, mime: string | null) =>
      r.processorsFor({ name, mime }).map((p) => p.options.name);

    expect(names('a.pdf', null)).toEqual(['pdf']);
    expect(names('a.bin', 'application/pdf; charset=binary')).toEqual(['pdf']);
    expect(names('a.txt', 'text/plain')).toEqual([]);
  });

  it('refuses two plugins with one name', () => {
    expect(() =>
      registry(processor('text'), aggregator('text', ['item.ingested'])),
    ).toThrow('plugin name "text" is used twice');
  });

  it("refuses names with ':', they go into job ids", () => {
    expect(() => registry(processor('pdf:v2'))).toThrow('bad plugin name');
  });

  it('refuses an aggregator listening to a topic that does not exist', () => {
    expect(() => registry(aggregator('feed', ['course.ingested']))).toThrow(
      'unknown topic course.ingested',
    );
  });

  it('refuses plugins that are not singletons', () => {
    expect(() => registry({ ...processor('pdf'), singleton: false })).toThrow(
      'must be a singleton',
    );
  });

  it('refuses transient plugins', () => {
    expect(() => registry({ ...processor('pdf'), transient: true })).toThrow(
      'must be a singleton',
    );
  });

  it('refuses a poll connector without poll()', () => {
    expect(() =>
      registry({
        key: ConnectorMark.KEY,
        options: { portal: 'acs', mode: 'poll', schedule: '* * * * *' },
        instance: { start() {} },
      }),
    ).toThrow('connector acs has no poll()');
  });
});
