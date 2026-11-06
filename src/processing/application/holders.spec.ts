import { MediaType, PluginName } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import type { Member } from '../domain/unpacking.js';
import {
  FakeFiles,
  holdersOf,
  InMemoryUnpackings,
} from './processing.fakes.js';

const notes = sha256('notes');
const mime = MediaType.parse('text/markdown');

const holding = (path: string): Member => ({
  path,
  hash: notes,
  size: 5,
  mime,
  leftOut: null,
});

async function holders(...containers: { name: string; live: boolean }[]) {
  const files = new FakeFiles(
    new Map([['f', { name: 'notes.md', mime, hash: notes }]]),
  );
  const unpackings = new InMemoryUnpackings();
  for (const { name, live } of containers) {
    const hash = sha256(name);
    if (live) files.files.set(name, { name, mime: null, hash });
    await unpackings.save({
      hash,
      unpacker: PluginName.parse('archives'),
      version: 1,
      policy: 1,
      members: [holding(`${name}/docs/notes.md`)],
      cutShort: null,
    });
  }
  return holdersOf(files, unpackings).of(notes);
}

describe('Holders', () => {
  it('names the files holding a content, then the members, by their last step', async () => {
    expect(await holders({ name: 'lab.zip', live: true })).toEqual([
      { name: 'notes.md', mime },
      { name: 'notes.md', mime },
    ]);
  });

  it('leaves out the members of a container no file holds', async () => {
    expect(
      await holders(
        { name: 'gone.zip', live: false },
        { name: 'lab.zip', live: true },
      ),
    ).toHaveLength(2);
  });
});
