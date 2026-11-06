import type { ContentHash, PluginName } from '@app/kernel';

// What an expander made of some content (an archive): the entries it holds,
// each stored as a content of its own. Kept by the content and the
// expander's version, as a Representation is.
export interface ExpansionKey {
  hash: ContentHash;
  expander: PluginName;
  version: number;
}

export interface Entry {
  // where it is in the content, as the expander named it
  path: string;
  hash: ContentHash;
  size: number;
}

export interface Expansion extends ExpansionKey {
  entries: Entry[];
}

// How deep in archives a content's names go: a file's entries are 1 deep,
// those of an archive in it 2. A content this deep isn't expanded, so
// neither an archive that holds itself nor one nested past it goes on.
export const MAX_DEPTH = 3;

// What one expansion stores, whatever the expander yields
export const CAPS = { entries: 5_000, bytes: 512 * 1024 * 1024 };

// Which entries an expansion stores, in turn: each up to what storage keeps
// of one content, all of them up to caps.bytes, an entry that won't fit
// left out and the next looked at; past caps.entries the rest is left out.
// An entry of no known size fits while there's room left.
export class Stored {
  private entries = 0;
  private bytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly caps = CAPS,
  ) {}

  // false once caps.entries are stored
  get open() {
    return this.entries < this.caps.entries;
  }

  fits(size = 0) {
    return size <= this.maxBytes && this.bytes + size <= this.caps.bytes;
  }

  add(size: number) {
    this.entries++;
    this.bytes += size;
  }
}

export abstract class ExpansionRepository {
  abstract exists(key: ExpansionKey): Promise<boolean>;
  abstract find(key: ExpansionKey): Promise<Expansion | null>;
  // the newest version each expander made of these contents
  abstract newestOf(hashes: readonly ContentHash[]): Promise<Expansion[]>;
  // the newest versions that hold this content among their entries
  abstract naming(hash: ContentHash): Promise<Expansion[]>;
  // saving the same one again is harmless
  abstract save(expansion: Expansion): Promise<void>;
}
