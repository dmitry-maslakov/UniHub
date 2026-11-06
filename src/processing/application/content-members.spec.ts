import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { MAX_DEPTH, type Entry } from '../domain/expansion.js';
import { ContentMembers } from './content-members.js';
import { InMemoryExpansions } from './processing.fakes.js';

const entry = (path: string, hash = sha256(path)): Entry => ({
  path,
  hash,
  size: 1,
});

async function members(
  expanded: {
    hash: ReturnType<typeof sha256>;
    entries: Entry[];
    expander?: string;
  }[],
) {
  const expansions = new InMemoryExpansions();
  for (const { hash, entries, expander = 'archives' } of expanded)
    await expansions.save({
      hash,
      expander: PluginName.parse(expander),
      version: 1,
      entries,
    });
  return new ContentMembers(expansions);
}

const labs = sha256('labs.zip');
const inner = sha256('inner.zip');

describe('ContentMembers', () => {
  it('is a content alone when it has no entries', async () => {
    const of = await (await members([])).of([labs]);
    expect(of.get(labs)).toEqual([{ path: null, hash: labs }]);
  });

  it("is a content, then its entries in turn, an archive's in its place", async () => {
    const of = await (
      await members([
        { hash: labs, entries: [entry('inner.zip', inner), entry('b.c')] },
        { hash: inner, entries: [entry('a.c')] },
      ])
    ).of([labs, inner]);

    expect(of.get(labs)).toEqual([
      { path: null, hash: labs },
      { path: 'inner.zip', hash: inner },
      { path: 'inner.zip/a.c', hash: sha256('a.c') },
      { path: 'b.c', hash: sha256('b.c') },
    ]);
    expect(of.get(inner)).toEqual([
      { path: null, hash: inner },
      { path: 'a.c', hash: sha256('a.c') },
    ]);
  });

  it("takes each expander's entries, by its name", async () => {
    const of = await (
      await members([
        { hash: labs, entries: [entry('b.c')], expander: 'zip-b' },
        { hash: labs, entries: [entry('a.c')], expander: 'zip-a' },
      ])
    ).of([labs]);

    expect(of.get(labs)!.map(({ path }) => path)).toEqual([null, 'a.c', 'b.c']);
  });

  it('goes no deeper than MAX_DEPTH, in an archive that holds itself', async () => {
    const of = await (
      await members([{ hash: labs, entries: [entry('labs.zip', labs)] }])
    ).of([labs]);

    expect(of.get(labs)).toHaveLength(MAX_DEPTH + 1);
  });
});
