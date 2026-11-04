import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { PluginName } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { ReconcileIndex } from '../src/processing/application/reconcile-index.js';
import { RepresentationRepository } from '../src/processing/domain/representation.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import {
  GENERATION,
  indexName,
} from '../src/processing/infrastructure/search/text-index.mapping.js';
import { bootApp } from './app.js';
import { testEnv } from './env.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// The texts' way into OpenSearch, through the queue, and back in step with
// postgres. What is indexed and what is queued is checked on fakes
// (IndexText, ReconcileIndex), how OpenSearch's answers are read on a stub
// of its client (OpenSearchTextIndex).

const portal = 'search-index-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX);
// what fake-text (version 1) makes of content: a part per form feed
const text = (content: string, version = 1) => ({
  hash: sha256(content),
  processor: PluginName.parse('fake-text'),
  version,
});
// the ids of a text's manifest and of its chunks, one per page
const ids = (
  { hash, processor, version }: ReturnType<typeof text>,
  pages: number,
) => {
  const id = `${hash}:${processor}:${version}`;
  return [id, ...Array.from({ length: pages }, (_, i) => `${id}:${i + 1}:0`)];
};

const byId = (a: string, b: string) => a.localeCompare(b);

const notes = 'search index: page one\fpage two';
const book = Array.from({ length: 250 }, (_, i) => `chapter ${i + 1}`).join(
  '\f',
);
const scan = '%PDF search index: a scan, no text';

describe('search index', { timeout: 60_000 }, () => {
  let app: INestApplication;
  let hub: PortalIngest;
  let prisma: PrismaService;
  let opensearch: Client;

  // the ids of the documents some content has in the index
  const documents = async (hash: string) => {
    const { body } = await opensearch.search({
      index,
      body: { size: 1_000, query: { term: { hash } }, _source: false },
    });
    return body.hits.hits.map(({ _id }) => _id!).toSorted(byId);
  };
  const indexed = (hash: string, expected: string[]) =>
    vi.waitFor(
      async () =>
        expect(await documents(hash)).toEqual(expected.toSorted(byId)),
      { timeout: 20_000, interval: 200 },
    );
  // No job halfway through a text when the index is deleted: it would find
  // the index gone mid-request (503) and wait that out as an outage.
  const deleteIndex = async () => {
    const queue = app.get<Queue>(getQueueToken(SEARCH_INDEX_QUEUE));
    await vi.waitFor(
      async () =>
        expect(
          await queue.getJobCountByTypes('active', 'wait', 'delayed'),
        ).toBe(0),
      { timeout: 20_000, interval: 200 },
    );
    await opensearch.indices.delete({ index }, { ignore: [404] });
  };
  const upload = async (name: string, content: string) => {
    await hub.file({ externalId: name, name });
    await hub.content(name, Readable.from([content]));
  };

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
    hub = portalIngest(app, portal);
    prisma = app.get(PrismaService);
    opensearch = app.get(OPENSEARCH);
  });

  afterAll(() => app.close());

  it('writes a processed text as a document per chunk and a manifest', async () => {
    await upload('notes.txt', notes);

    await indexed(sha256(notes), ids(text(notes), 2));
    const { body } = await opensearch.get({
      index,
      id: ids(text(notes), 0)[0],
    });
    expect(body._source).toEqual({ ...text(notes), chunks: 2 });
  });

  it('writes a text of more chunks than a bulk request takes', async () => {
    await upload('book.txt', book);

    await indexed(sha256(book), ids(text(book), 250));
  });

  it('writes the manifest alone for content a processor found no text in', async () => {
    await upload('scan.pdf', scan);

    await indexed(sha256(scan), [`${sha256(scan)}:fake-pdf:1`]);
  });

  it('reads the newest version of each text from postgres', async () => {
    await prisma.representation.create({
      data: { ...text(notes, 2), parts: ['page one, again'] },
    });

    const keys = [];
    for await (const key of app.get(RepresentationRepository).newestKeys())
      if (key.hash === sha256(notes)) keys.push(key);

    expect(keys).toEqual([text(notes, 2)]);
  });

  it('puts the index back in step: older versions, lost texts and texts postgres no longer has', async () => {
    await opensearch.deleteByQuery({
      index,
      refresh: true,
      body: { query: { term: { hash: sha256(scan) } } },
    });
    // the file gone too, or the processors' reconcile would make it again
    await hub.removeFile('book.txt');
    await prisma.representation.delete({
      where: { hash_processor_version: text(book) },
    });

    expect(await app.get(ReconcileIndex).run()).toBeGreaterThanOrEqual(3);

    await indexed(sha256(notes), ids(text(notes, 2), 1));
    await indexed(sha256(scan), [`${sha256(scan)}:fake-pdf:1`]);
    await indexed(sha256(book), []);
  });

  it('makes the index again when it was deleted while the app runs', async () => {
    await deleteIndex();
    const after = 'search index: written after the index was deleted';

    await upload('after.txt', after);

    await indexed(sha256(after), ids(text(after), 1));
    const { body } = await opensearch.indices.getMapping({ index });
    expect(body[index].mappings._meta).toEqual({ generation: GENERATION });

    // and a reconcile fills it anew
    await deleteIndex();
    await app.get(ReconcileIndex).run();

    await indexed(sha256(notes), ids(text(notes, 2), 1));
    await indexed(sha256(after), ids(text(after), 1));
  });
});
