import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { ContentHash } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { keyId, RepresentationRepository } from '../domain/representation.js';
import { ListWaitingQuery, type WaitingContent } from './queries.js';

// What the processors on are yet to make: the same rule as the reconciler's
// (no representation of the processor's current version), asked for many
// contents with one read.
@QueryHandler(ListWaitingQuery)
export class ListWaiting implements IQueryHandler<ListWaitingQuery> {
  constructor(
    private readonly plugins: PluginCatalog,
    private readonly representations: RepresentationRepository,
  ) {}

  async execute({ files }: ListWaitingQuery) {
    const made = new Set(
      (await this.representations.keysOf(files.map(({ hash }) => hash))).map(
        keyId,
      ),
    );
    const waiting = new Map<ContentHash, WaitingContent>();
    for (const { hash, ...file } of files)
      for (const { processor } of this.plugins.processorsFor(file)) {
        const { name, version, heavy } = processor.spec;
        if (made.has(keyId({ hash, processor: name, version }))) continue;
        const content = waiting.get(hash) ?? {
          hash,
          text: false,
          pictures: false,
        };
        if (heavy) content.pictures = true;
        else content.text = true;
        waiting.set(hash, content);
      }
    return [...waiting.values()];
  }
}
