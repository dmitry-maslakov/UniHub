import { Injectable } from '@nestjs/common';
import type { ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { ExpansionRepository, MAX_DEPTH } from '../domain/expansion.js';
import { FileFacts, type FileFact } from './ports.js';

// a name a content goes by, and how deep in archives: 0 for a file's
export interface KnownName extends FileFact {
  depth: number;
}

// The names a content goes by, which processors and expanders take it by:
// those of the files that hold it and aren't removed, and the paths it has
// as an entry in the newest expansions of contents known so (one deeper),
// by an expander that's on and takes one of their names, to MAX_DEPTH. An
// entry has no media type: it's taken by its path.
@Injectable()
export class ContentNames {
  constructor(
    private readonly files: FileFacts,
    private readonly expansions: ExpansionRepository,
    private readonly plugins: PluginCatalog,
  ) {}

  // the names no deeper than depth
  async holding(hash: ContentHash, depth = MAX_DEPTH): Promise<KnownName[]> {
    const files = await this.files.holding(hash);
    const names = files.map(({ name, mime }) => ({ name, mime, depth: 0 }));
    if (depth === 0) return names;
    for (const expansion of await this.expansions.naming(hash)) {
      const spec = this.plugins.expander(expansion.expander)?.spec;
      if (!spec) continue;
      const outer = (await this.holding(expansion.hash, depth - 1)).filter(
        (name) => spec.match(name) !== null,
      );
      if (!outer.length) continue;
      const nearest = Math.min(...outer.map((name) => name.depth)) + 1;
      for (const { path, hash: of } of expansion.entries)
        if (of === hash) names.push({ name: path, mime: null, depth: nearest });
    }
    return names;
  }

  // every content known by a name, once per name: the files', then their
  // entries' (for the reconciler)
  async *all(): AsyncIterable<KnownName & { hash: ContentHash }> {
    for await (const file of this.files.withContent())
      yield* this.within({ ...file, depth: 0 });
  }

  private async *within(
    named: KnownName & { hash: ContentHash },
  ): AsyncIterable<KnownName & { hash: ContentHash }> {
    yield named;
    if (named.depth >= MAX_DEPTH) return;
    const expanders = this.plugins.expandersFor(named);
    if (!expanders.length) return;
    const taken = new Set(expanders.map(({ spec }) => spec.name));
    for (const { expander, entries } of await this.expansions.newestOf([
      named.hash,
    ]))
      if (taken.has(expander))
        for (const { path, hash } of entries)
          yield* this.within({
            name: path,
            mime: null,
            hash,
            depth: named.depth + 1,
          });
  }
}
