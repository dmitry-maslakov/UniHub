import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Client, Types } from '@opensearch-project/opensearch';
import pRetry from 'p-retry';
import type { ContentHash, PluginName } from '@app/kernel';
import { opensearchConfig } from '../../../platform/search/opensearch.config.js';
import { OPENSEARCH } from '../../../platform/search/opensearch.module.js';
import { TextIndex, type TextQuery } from '../../application/ports.js';
import type { TextChunk } from '../../domain/chunks.js';
import type { RepresentationKey } from '../../domain/representation.js';
import {
  bulkError,
  isAlreadyThere,
  isIndexMissing,
  translated,
} from './opensearch-errors.js';
import {
  chunkDocs,
  contentHits,
  manifest,
  manifestKeys,
  versionsOf,
} from './text-index.documents.js';
import {
  GENERATION,
  indexBody,
  indexName,
  keywordBody,
} from './text-index.mapping.js';

// documents per bulk request
const BULK = 200;
// Someone waits on a search: one stuck past this is an outage, not a wait
// of the client's 30 s, which writes keep.
const SEARCH_TIMEOUT_MS = 5_000;

// what keys() reads of a composite aggregation: put() wrote the keys, they're
// read back as them
interface KeysPage {
  buckets: { key: RepresentationKey }[];
  after_key?: Types.Common_Aggregations.CompositeAggregateKey;
}

// The index made when first used, and made again when a write or a read
// finds it gone (then tried once more), so the app starts while OpenSearch
// is away and outlives a new volume or a deleted index.
@Injectable()
export class OpenSearchTextIndex extends TextIndex {
  private readonly index: string;
  private ensured?: Promise<void>;

  constructor(
    @Inject(OPENSEARCH) private readonly client: Client,
    @Inject(opensearchConfig.KEY)
    { prefix }: ConfigType<typeof opensearchConfig>,
  ) {
    super();
    this.index = indexName(prefix);
  }

  ensure() {
    return this.translating(() => this.create());
  }

  // All in one try, so an index gone midway is filled anew. The manifest
  // comes only once every chunk is in (bulk isn't atomic), and its refresh
  // shows the chunks too.
  put(key: RepresentationKey, chunks: readonly TextChunk[]) {
    return this.onIndex(async () => {
      const docs = chunkDocs(key, chunks);
      for (let i = 0; i < docs.length; i += BULK) {
        const { body } = await this.client.bulk({
          index: this.index,
          body: docs.slice(i, i + BULK).flat(),
        });
        if (body.errors) throw bulkError(body.items);
      }
      await this.client.index({
        index: this.index,
        ...manifest(key, chunks.length),
        refresh: 'wait_for',
      });
      await this.drop(key, key.version);
    });
  }

  async remove(of: { hash: ContentHash; processor: PluginName }) {
    await this.onIndex(() => this.drop(of));
  }

  // paged by the composite's after_key
  async *keys() {
    let after: KeysPage['after_key'];
    do {
      const { body } = await this.onIndex(() =>
        this.client.search({ index: this.index, body: manifestKeys(after) }),
      );
      const page = body.aggregations?.keys as unknown as KeysPage;
      yield* page.buckets.map(({ key }) => key);
      after = page.after_key;
    } while (after);
  }

  async search(query: TextQuery) {
    const { body } = await this.onIndex(() =>
      this.client.search(
        { index: this.index, body: keywordBody(query) },
        { requestTimeout: SEARCH_TIMEOUT_MS },
      ),
    );
    return contentHits(body.hits.hits);
  }

  // the index with this generation's mapping, made if missing
  private async create() {
    await this.client.indices
      .create({ index: this.index, body: indexBody() })
      .catch((err: unknown) => {
        if (!isAlreadyThere(err)) throw err;
      });
    const { body } = await this.client.indices.getMapping({
      index: this.index,
    });
    // made by hand, or by a write to a node left to create unihub-* indices
    // (the compose files tell it not to): not this generation's analyzers
    if (body[this.index]?.mappings._meta?.generation !== GENERATION)
      throw new Error(
        `index ${this.index} exists with another mapping: delete it`,
      );
  }

  private ready() {
    this.ensured ??= this.create().catch((err: unknown) => {
      this.ensured = undefined;
      throw err;
    });
    return this.ensured;
  }

  private onIndex<T>(op: () => Promise<T>) {
    return this.translating(() =>
      pRetry(
        async () => {
          await this.ready();
          return op();
        },
        {
          retries: 1,
          minTimeout: 0,
          shouldRetry: ({ error }) => isIndexMissing(error),
          onFailedAttempt: ({ error }) => {
            if (isIndexMissing(error)) this.ensured = undefined;
          },
        },
      ),
    );
  }

  private async translating<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (err) {
      throw translated(err);
    }
  }

  private drop(
    of: { hash: ContentHash; processor: PluginName },
    except?: number,
  ) {
    return this.client.deleteByQuery({
      index: this.index,
      refresh: true,
      conflicts: 'proceed',
      body: { query: versionsOf(of, except) },
    });
  }
}
