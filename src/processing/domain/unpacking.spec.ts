import { PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { isCurrent, kept, type Member, type Unpacking } from './unpacking.js';

const unpacker = PluginName.parse('archives');
const hash = sha256('lab.zip');

const member = (path: string, content: string | null): Member => ({
  path,
  hash: content === null ? null : sha256(content),
  size: null,
  mime: null,
  leftOut: content === null ? 'TOO_LARGE' : null,
});

const tree: Unpacking = {
  hash,
  unpacker,
  version: 2,
  policy: 1,
  members: [member('main.c', 'int main'), member('big.bin', null)],
  cutShort: null,
};

describe('Unpacking', () => {
  it('keeps the members stored', () => {
    expect(kept(tree.members).map(({ path }) => path)).toEqual(['main.c']);
  });

  it("is current when made by the unpacker's version under these limits", () => {
    const key = { hash, unpacker, version: 2 };

    expect(isCurrent(tree, key, 1)).toBe(true);
    expect(isCurrent(tree, { ...key, version: 3 }, 1)).toBe(false);
    expect(isCurrent(tree, key, 2)).toBe(false);
    expect(
      isCurrent(tree, { ...key, unpacker: PluginName.parse('other') }, 1),
    ).toBe(false);
  });
});
