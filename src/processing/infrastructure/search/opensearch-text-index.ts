import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { API, Client, Types } from '@opensearch-project/opensearch';
import pRetry from 'p-retry';
import type { ContentHash, PluginName } from '@app/kernel';
import { opensearchConfig } from '../../../platform/search/opensearch.config.js';
import { OPENSEARCH } from '../../../platform/search/opensearch.module.js';
import {
  TextIndex,
  type IndexedChunk,
  type IndexedRecordChunk,
  type TextQuery,
} from '../../application/ports.js';
import { refId, type RecordKey, type RecordRef } from '../../domain/records.js';
import type { RepresentationKey } from '../../domain/representation.js';
import { textSearchConfig } from '../../text-search.config.js';
import {
  bulkError,
  isAlreadyThere,
  isGone,
  translated,
} from './opensearch-errors.js';
import {
  chunkDocs,
  manifest,
  manifestKeys,
  recordDocs,
  recordManifest,
  recordManifestKeys,
  recordOf,
  versionsOf,
} from './text-index.documents.js';
import {
  indexBody,
  indexName,
  PIPELINE,
  pipelineName,
} from './text-index.mapping.js';
import { contentHits, searchRequest } from './text-index.search.js';

// documents per bulk request
const BULK = 200;
// Someone waits on a search: one stuck past this is an outage, not a wait
// of the client's 30 s, which writes keep.
const SEARCH_TIMEOUT_MS = 5_000;

// what keys() reads of a composite aggregation: put() wrote the keys, they're
// read back as them
interface KeysPage<K> {
  buckets: { key: K }[];
  after_key?: Types.Common_Aggregations.CompositeAggregateKey;
}

// a record's manifest, as putRecord() wrote it
type RecordFields = Omit<RecordKey, 'id'> & { record: RecordKey['id'] };

// The index, and with vectors the hybrid search pipeline, made when first
// used, and made again when a write or a read finds either gone (then tried
// once more), so the app starts while OpenSearch is away and outlives a new
// volume or a deleted index or pipeline.
@Injectable()
export class OpenSearchTextIndex extends TextIndex {
  private readonly index: string;
  private readonly body: ReturnType<typeof indexBody>;
  // none without vectors: a keyword search takes no pipeline
  private readonly pipeline: string | null;
  private ensured?: Promise<void>;

  constructor(
    @Inject(OPENSEARCH) private readonly client: Client,
    @Inject(opensearchConfig.KEY)
    { prefix }: ConfigType<typeof opensearchConfig>,
    @Inject(textSearchConfig.KEY)
    { embedding }: ConfigType<typeof textSearchConfig>,
  ) {
    super();
    this.index = indexName(prefix, embedding);
    this.body = indexBody(embedding);
    this.pipeline = embedding && pipelineName(prefix);
  }

  ensure() {
    return this.translating(() => this.create());
  }

  put(key: RepresentationKey, chunks: readonly IndexedChunk[]) {
    return this.onIndex(() =>
      this.writing(
        chunkDocs(key, chunks),
        manifest(key, chunks.length),
        versionsOf(key, key.version),
      ),
    );
  }

  async remove(of: { hash: ContentHash; processor: PluginName }) {
    await this.onIndex(() => this.deleting(versionsOf(of)));
  }

  async *keys() {
    yield* this.pages<RepresentationKey>(manifestKeys);
  }

  // As a text is written, but a record's manifest waits for the refresh
  // only when it replaces one, for the drop to find what it replaced: one
  // written the first time, as a backfill writes them all, replaces nothing
  // (a get is real-time, a search isn't), and is searchable within the
  // second. A write that failed partway is tried again whole.
  putRecord(key: RecordKey, chunks: readonly IndexedRecordChunk[]) {
    return this.onIndex(async () =>
      this.writing(
        recordDocs(key, chunks),
        recordManifest(key, chunks.length),
        (await this.has(refId(key))) ? recordOf(key, key.fingerprint) : null,
      ),
    );
  }

  // its manifest first, if there is one, its refresh showing its chunks to
  // the drop
  async removeRecord(ref: RecordRef) {
    await this.onIndex(async () => {
      const id = refId(ref);
      if (await this.has(id))
        await this.client.delete({
          index: this.index,
          id,
          refresh: 'wait_for',
        });
      await this.deleting(recordOf(ref));
    });
  }

  async *recordKeys() {
    for await (const { record, ...key } of this.pages<RecordFields>(
      recordManifestKeys,
    ))
      yield { ...key, id: record } as RecordKey;
  }

  // Not after making sure of the index, which waits the client's 30 s on a
  // stuck node (twice): a search finds the index or the pipeline gone by
  // itself, answered at once, and only then makes them. One of another
  // mapping is for the writes to refuse.
  async search(query: TextQuery) {
    const { body } = await this.onIndex(
      () =>
        this.client.search(
          { index: this.index, ...searchRequest(query, this.pipeline) },
          { requestTimeout: SEARCH_TIMEOUT_MS },
        ),
      { first: false },
    );
    return contentHits(body.hits.hits);
  }

  // The pipeline put (the same again is harmless) and the index with this
  // generation's mapping, made if missing. One of this generation made
  // before a field was added gets it: putting a mapping adds the fields it
  // lacks, and refuses one that differs.
  private async create() {
    if (this.pipeline)
      await this.client.searchPipeline.put({
        id: this.pipeline,
        body: PIPELINE,
      });
    await this.client.indices
      .create({ index: this.index, body: this.body })
      .catch((err: unknown) => {
        if (!isAlreadyThere(err)) throw err;
      });
    const { body } = await this.client.indices.getMapping({
      index: this.index,
    });
    // made by hand, or by a write to a node left to create unihub-* indices
    // (the compose files tell it not to): not this generation's analyzers,
    // nor this model's vectors
    if (
      !isDeepStrictEqual(
        body[this.index]?.mappings._meta,
        this.body.mappings._meta,
      )
    )
      throw new Error(
        `index ${this.index} exists with another mapping: delete it`,
      );
    await this.client.indices.putMapping({
      index: this.index,
      body: { properties: this.body.mappings.properties },
    });
  }

  // A text's or a record's chunks, BULK a request, then its manifest, then
  // the documents of its other versions dropped, if it has any. Called in
  // one try, so an index gone midway is filled anew. The manifest comes only
  // once every chunk is in (bulk isn't atomic); before a drop its refresh
  // shows the chunks to it and to a search.
  private async writing(
    docs: object[][],
    { id, body }: { id: string; body: object },
    others: Types.Common_QueryDsl.QueryContainer | null,
  ) {
    for (let i = 0; i < docs.length; i += BULK) {
      const { body } = await this.client.bulk({
        index: this.index,
        body: docs.slice(i, i + BULK).flat(),
      });
      if (body.errors) throw bulkError(body.items);
    }
    await this.client.index({
      index: this.index,
      id,
      body,
      ...(others && { refresh: 'wait_for' as const }),
    });
    if (others) await this.deleting(others);
  }

  // whether a document is there, as a get sees it: at once
  private async has(id: string) {
    return (await this.client.exists({ index: this.index, id })).body;
  }

  // the keys a composite aggregation buckets, paged by its after_key
  private async *pages<K>(
    query: (after?: KeysPage<K>['after_key']) => API.Search_RequestBody,
  ) {
    let after: KeysPage<K>['after_key'];
    do {
      const { body } = await this.onIndex(() =>
        this.client.search({ index: this.index, body: query(after) }),
      );
      const page = body.aggregations?.keys as unknown as KeysPage<K>;
      yield* page.buckets.map(({ key }) => key);
      after = page.after_key;
    } while (after);
  }

  private ready() {
    this.ensured ??= this.create().catch((err: unknown) => {
      this.ensured = undefined;
      throw err;
    });
    return this.ensured;
  }

  // the index made sure of `first`, or only once op finds it (or the
  // pipeline) gone
  private onIndex<T>(op: () => Promise<T>, { first = true } = {}) {
    return this.translating(() =>
      pRetry(
        async (attempt) => {
          if (first || attempt > 1) await this.ready();
          return op();
        },
        {
          retries: 1,
          minTimeout: 0,
          shouldRetry: ({ error }) => isGone(error),
          onFailedAttempt: ({ error }) => {
            if (isGone(error)) this.ensured = undefined;
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

  private deleting(query: Types.Common_QueryDsl.QueryContainer) {
    return this.client.deleteByQuery({
      index: this.index,
      refresh: true,
      conflicts: 'proceed',
      body: { query },
    });
  }
}
