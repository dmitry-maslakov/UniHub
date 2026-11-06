import { PluginName } from '@app/kernel';
import {
  catalogOf,
  expander,
  processor,
} from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import { MAX_DEPTH, type Entry } from '../domain/expansion.js';
import { FakeFiles, InMemoryExpansions, namesOf } from './processing.fakes.js';

const labs = sha256('labs.zip');
const inner = sha256('inner.zip');
const main = sha256('main.c');
const deep = sha256('deep.c');
const archives = PluginName.parse('archives');

const entry = (path: string, hash = sha256(path)): Entry => ({
  path,
  hash,
  size: 1,
});

// labs.zip holds lab/main.c and inner.zip, which holds deep.c
async function names({
  files = { 'labs.zip': labs } as Record<string, typeof labs>,
  expanders = [expander('archives', ['.zip'])],
  more = [] as { hash: typeof labs; entries: Entry[]; version?: number }[],
} = {}) {
  const expansions = new InMemoryExpansions();
  for (const { hash, entries, version = 1 } of [
    {
      hash: labs,
      entries: [entry('lab/main.c', main), entry('inner.zip', inner)],
    },
    { hash: inner, entries: [entry('deep.c', deep)] },
    ...more,
  ])
    await expansions.save({ hash, expander: archives, version, entries });
  const plugins = catalogOf({
    processors: [processor('text', ['.c'])],
    expanders,
  });
  const facts = new FakeFiles(
    new Map(
      Object.entries(files).map(([name, hash]) => [
        name,
        { name, mime: null, hash },
      ]),
    ),
  );
  return namesOf(facts, plugins, expansions);
}

describe('ContentNames', () => {
  it("names a content by its files, and an entry by its path, a level deeper than the archive's", async () => {
    const known = await names();

    expect(await known.holding(labs)).toEqual([
      { name: 'labs.zip', mime: null, depth: 0 },
    ]);
    expect(await known.holding(main)).toEqual([
      { name: 'lab/main.c', mime: null, depth: 1 },
    ]);
    expect(await known.holding(deep)).toEqual([
      { name: 'deep.c', mime: null, depth: 2 },
    ]);
  });

  it('names a content held as a file and as an entry both ways', async () => {
    const known = await names({ files: { 'labs.zip': labs, 'main.c': main } });

    expect(await known.holding(main)).toEqual([
      { name: 'main.c', mime: null, depth: 0 },
      { name: 'lab/main.c', mime: null, depth: 1 },
    ]);
  });

  it('names no entry of an archive no file holds as one the expander takes', async () => {
    expect(
      await (await names({ files: { 'labs.bin': labs } })).holding(main),
    ).toEqual([]);
    expect(await (await names({ files: {} })).holding(main)).toEqual([]);
  });

  it('names no entry of an expander turned off', async () => {
    expect(await (await names({ expanders: [] })).holding(main)).toEqual([]);
  });

  it("names only the entries of an expander's newest version", async () => {
    const known = await names({
      more: [{ hash: labs, version: 2, entries: [entry('inner.zip', inner)] }],
    });
    expect(await known.holding(main)).toEqual([]);
    expect(await known.holding(deep)).toHaveLength(1);
  });

  it('looks no deeper than it is asked to', async () => {
    expect(await (await names()).holding(deep, 1)).toEqual([]);
  });

  it('names an archive that holds itself once as its entry, and ends', async () => {
    const known = await names({
      more: [{ hash: labs, version: 2, entries: [entry('labs.zip', labs)] }],
    });

    expect(await known.holding(labs)).toEqual([
      { name: 'labs.zip', mime: null, depth: 0 },
      { name: 'labs.zip', mime: null, depth: 1 },
    ]);
  });

  it('lists every content known by a name, files first, then their entries in turn', async () => {
    const all = [];
    for await (const { name, hash, depth } of (await names()).all())
      all.push({ name, hash, depth });

    expect(all).toEqual([
      { name: 'labs.zip', hash: labs, depth: 0 },
      { name: 'lab/main.c', hash: main, depth: 1 },
      { name: 'inner.zip', hash: inner, depth: 1 },
      { name: 'deep.c', hash: deep, depth: 2 },
    ]);
  });

  it('lists an archive that holds itself down to MAX_DEPTH', async () => {
    const known = await names({
      more: [{ hash: labs, version: 2, entries: [entry('labs.zip', labs)] }],
    });
    const depths = [];
    for await (const { depth } of known.all()) depths.push(depth);

    expect(depths).toEqual(Array.from({ length: MAX_DEPTH + 1 }, (_, i) => i));
  });
});
