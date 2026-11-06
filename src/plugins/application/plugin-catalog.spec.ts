import { FILE_REMOVED, ITEM_INGESTED, ITEM_REMOVED } from '@app/plugin-sdk';
import { MediaType, PluginName, PortalId } from '@app/kernel';
import {
  aggregator,
  catalogOf,
  poll,
  processor,
  push,
  unpacker,
} from '../../../test/discovered-plugins.js';
import { PortalHasTwoWritersError } from '../domain/errors.js';

const names = (plugins: { spec: { name: string } }[]) =>
  plugins.map((p) => p.spec.name);

describe('PluginCatalog', () => {
  const catalog = catalogOf({
    polls: [poll('moodle')],
    pushes: [push('teams', { run: async () => {} })],
    processors: [
      processor('pdf', ['.pdf', 'application/pdf']),
      processor('slides', ['.pptx', '.pdf']),
    ],
    unpackers: [
      unpacker('archives', ['.zip', 'application/zip']),
      unpacker('books', ['.epub']),
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

  it('finds the one unpacker that takes a file, with the entry it matched', () => {
    const zip = MediaType.parse('application/zip');
    const found = catalog.unpackerFor({ name: 'labs', mime: zip });

    expect([found?.unpacker.spec.name, found?.matched]).toEqual([
      'archives',
      'application/zip',
    ]);
    expect(catalog.unpackerFor({ name: 'a.pdf', mime: null })).toBeNull();
  });

  it("finds the unpacker by the file's extension first, whichever comes first", () => {
    const zip = MediaType.parse('application/zip');
    expect(
      catalog.unpackerFor({ name: 'book.epub', mime: zip })?.unpacker.spec.name,
    ).toBe('books');
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
    expect(catalog.unpacker(PluginName.parse('archives'))).toBeDefined();
    expect(catalog.unpacker(PluginName.parse('pdf'))).toBeUndefined();
    expect(catalog.pollConnector(PortalId.parse('moodle'))).toBeDefined();
    expect(catalog.pollConnector(PortalId.parse('teams'))).toBeUndefined();
  });

  it('names the processors on, and none of the other kinds', () => {
    expect(catalog.processorNames).toEqual(['pdf', 'slides']);
    expect(
      catalogOf({ unpackers: [unpacker('archives', ['.zip'])] }).processorNames,
    ).toEqual([]);
  });

  it('finds the connector that links accounts of a portal by a mode', () => {
    const identifies = {
      poll: async () => {},
      identify: async () => ({ id: '7', expiresAt: null }),
    };
    const links = catalogOf({
      polls: [poll('canvas', identifies, ['token']), poll('moodle')],
      pushes: [
        push('teams', { ...identifies, run: async () => {} }, ['token']),
      ],
    });
    const portal = (id: string) => PortalId.parse(id);

    expect(links.linker(portal('canvas'), 'token')).toBe(identifies);
    expect(links.linker(portal('teams'), 'token')).not.toBeNull();
    // one that names no links, and a portal no connector here serves
    expect(links.linker(portal('moodle'), 'token')).toBeNull();
    expect(links.linker(portal('elsewhere'), 'token')).toBeNull();
  });

  it('stops the app on plugins that break the rules', () => {
    expect(() => catalogOf({ polls: [poll('moodle')] }, ['moodle'])).toThrow(
      PortalHasTwoWritersError,
    );
  });
});
