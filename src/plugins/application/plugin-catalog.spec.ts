import { FILE_REMOVED, ITEM_INGESTED, ITEM_REMOVED } from '@app/plugin-sdk';
import { MediaType, PluginName, PortalId } from '@app/kernel';
import { PortalHasTwoWritersError } from '../domain/errors.js';
import {
  aggregator,
  catalogOf,
  poll,
  processor,
  push,
} from './plugins.fakes.js';

const names = (plugins: { spec: { name: string } }[]) =>
  plugins.map((p) => p.spec.name);

describe('PluginCatalog', () => {
  const catalog = catalogOf({
    polls: [poll('acs')],
    pushes: [push('teams', { start() {}, stop() {} })],
    processors: [
      processor('pdf', ['.pdf', 'application/pdf']),
      processor('slides', ['.pptx', '.pdf']),
    ],
    aggregators: [
      aggregator('feed', [ITEM_INGESTED, ITEM_REMOVED]),
      aggregator('files', [FILE_REMOVED]),
    ],
  });

  it('finds the processors that take a file, with the entry each matched', () => {
    const mime = MediaType.parse('application/pdf');
    expect(
      catalog
        .processorsFor({ name: 'notes', mime })
        .map(({ processor, matched }) => [processor.spec.name, matched]),
    ).toEqual([['pdf', 'application/pdf']]);
    expect(
      catalog
        .processorsFor({ name: 'a.pdf', mime })
        .map(({ matched }) => matched),
    ).toEqual(['.pdf', '.pdf']);
  });

  it('finds the aggregators listening to a topic', () => {
    expect(names(catalog.aggregatorsFor(ITEM_REMOVED))).toEqual(['feed']);
    expect(names(catalog.aggregatorsFor(FILE_REMOVED))).toEqual(['files']);
  });

  it('finds plugins by name and poll connectors by portal', () => {
    expect(catalog.processor(PluginName.parse('slides'))?.spec.name).toBe(
      'slides',
    );
    expect(catalog.aggregator(PluginName.parse('slides'))).toBeUndefined();
    expect(catalog.pollConnector(PortalId.parse('acs'))).toBeDefined();
    expect(catalog.pollConnector(PortalId.parse('teams'))).toBeUndefined();
  });

  it('stops the app on plugins that break the rules', () => {
    expect(() => catalogOf({ polls: [poll('acs')] }, ['acs'])).toThrow(
      PortalHasTwoWritersError,
    );
  });
});
