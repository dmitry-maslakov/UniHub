import { Injectable } from '@nestjs/common';
import type { ContentHash } from '@app/kernel';
import type { Member } from '../domain/content-texts.js';
import {
  ExpansionRepository,
  MAX_DEPTH,
  type Entry,
} from '../domain/expansion.js';

// The contents whose texts make up each of these, as content-texts.ts reads
// them: itself, then the entries of its newest expansions in turn (by
// expander), each followed by its own entries, to MAX_DEPTH. One query a
// level of each archive.
@Injectable()
export class ContentMembers {
  constructor(private readonly expansions: ExpansionRepository) {}

  async of(hashes: readonly ContentHash[]) {
    const inside = await this.entriesOf(hashes);
    const members = new Map<ContentHash, Member[]>();
    for (const hash of hashes)
      members.set(hash, [
        { path: null, hash },
        ...(await this.within(inside.get(hash) ?? [], '', 1)),
      ]);
    return members;
  }

  private async within(
    entries: readonly Entry[],
    prefix: string,
    depth: number,
  ): Promise<Member[]> {
    const inside =
      depth < MAX_DEPTH
        ? await this.entriesOf(entries.map(({ hash }) => hash))
        : new Map<ContentHash, Entry[]>();
    const members: Member[] = [];
    for (const { path, hash } of entries) {
      members.push({ path: prefix + path, hash });
      const theirs = inside.get(hash);
      if (theirs)
        members.push(
          ...(await this.within(theirs, `${prefix}${path}/`, depth + 1)),
        );
    }
    return members;
  }

  // each content's entries, its expanders' by name
  private async entriesOf(hashes: readonly ContentHash[]) {
    const entries = new Map<ContentHash, Entry[]>();
    if (!hashes.length) return entries;
    const expansions = (
      await this.expansions.newestOf([...new Set(hashes)])
    ).toSorted((a, b) => (a.expander < b.expander ? -1 : 1));
    for (const { hash, entries: theirs } of expansions)
      entries.set(hash, [...(entries.get(hash) ?? []), ...theirs]);
    return entries;
  }
}
