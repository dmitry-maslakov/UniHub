import { Readable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Client } from '@opensearch-project/opensearch';
import type { PortalIngest } from '@app/plugin-sdk';
import { NO_INSTANCE, PluginName } from '@app/kernel';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OPENSEARCH } from '../src/platform/search/opensearch.module.js';
import { TextIndex } from '../src/processing/application/ports.js';
import { ReconcileIndex } from '../src/processing/application/reconcile-index.js';
import {
  keyId,
  RepresentationRepository,
} from '../src/processing/domain/representation.js';
import { SEARCH_INDEX_QUEUE } from '../src/processing/infrastructure/search/search-index.queue.js';
import {
  GENERATION,
  indexBody,
  indexName,
} from '../src/processing/infrastructure/search/text-index.mapping.js';
import { bootApp } from './app.js';
import { testEnv, testVectors } from './env.js';
import { FakeEmbedder } from './fake-models.js';
import { FakePluginsModule } from './fake-plugins.js';
import { portalIngest } from './ingest.js';
import { sha256 } from './sha256.js';

// The texts' and the records' way into OpenSearch, through the queue, and
// back in step with postgres. What is indexed and what is queued is checked
// on fakes (IndexText, IndexRecord, ReconcileIndex), how OpenSearch's
// answers are read on a stub of its client (OpenSearchTextIndex).

const portal = 'search-index-test';
const index = indexName(testEnv.OPENSEARCH_INDEX_PREFIX, testVectors);
// what fake-text (version 1) makes of content: a part per form feed, and
// what fake-pdf does
const text = (content: string, version = 1, processor = 'fake-text') => ({
  hash: sha256(content),
  processor: PluginName.parse(processor),
  version,
});
// the ids of a text's manifest and of its chunks, one per page
const ids = (key: ReturnType<typeof text>, pages: number) => {
  const id = keyId(key);
  return [id, ...Array.from({ length: pages }, (_, i) => `${id}__${i + 1}__0`)];
};

const byId = (a: string, b: string) => a.localeCompare(b);

const notes = 'search index: page one\fpage two';
const book = Array.from({ length: 250 }, (_, i) => `chapter ${i + 1}`).join(
  '\f',
);
const scan = '%PDF search index: a scan, no text';

// A job takes up to a second (its manifest waits for a refresh), and a
// reconcile, the one at start too, queues every text the specs before left
// in the index (some 30) ahead of a spec's own: a wait for one is given a
// minute.
const WAIT = { timeout: 60_000, interval: 200 };

describe('search index', { timeout: 120_000 }, () => {
  let app: INestApplication;
  let hub: PortalIngest;
  let prisma: PrismaService;
  let opensearch: Client;

  // the ids of the documents some content's texts have in the index, not
  // the records naming it
  const documents = async (hash: string) => {
    const { body } = await opensearch.search({
      index,
      body: {
        size: 1_000,
        query: {
          bool: {
            filter: [{ term: { hash } }],
            must_not: [{ exists: { field: 'kind' } }],
          },
        },
        _source: false,
      },
    });
    return body.hits.hits.map(({ _id }) => _id!).toSorted(byId);
  };
  const indexed = (hash: string, expected: string[]) =>
    vi.waitFor(
      async () =>
        expect(await documents(hash)).toEqual(expected.toSorted(byId)),
      WAIT,
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
      WAIT,
    );
    await opensearch.indices.delete({ index }, { ignore: [404] });
  };
  const upload = async (name: string, content: string) => {
    await hub.file({ externalId: name, name });
    await hub.content(name, Readable.from([content]));
  };
  // a record's documents, by id, with what they hold
  const record = async (kind: string, id: string) => {
    const { body } = await opensearch.search({
      index,
      body: {
        size: 1_000,
        query: {
          bool: { filter: [{ term: { kind } }, { term: { record: id } }] },
        },
      },
    });
    return Object.fromEntries(
      body.hits.hits.map(({ _id, _source }) => [_id, _source]),
    );
  };
  const recorded = (kind: string, id: string, expected: object) =>
    vi.waitFor(
      async () => expect(await record(kind, id)).toEqual(expected),
      WAIT,
    );
  const idOf = async (table: 'item' | 'file', externalId: string) =>
    (
      await (prisma[table] as typeof prisma.file).findUniqueOrThrow({
        where: {
          portal_instance_externalId: {
            instance: NO_INSTANCE,
            portal,
            externalId,
          },
        },
      })
    ).id;
  const post = (externalId: string, body: string) =>
    hub.item({ externalId, kind: 'post', title: 'Notice', raw: { body } });

  beforeAll(async () => {
    app = await bootApp({ imports: [FakePluginsModule] });
    hub = portalIngest(app, portal);
    prisma = app.get(PrismaService);
    opensearch = app.get(OPENSEARCH);
  });

  afterAll(() => app.close());

  it("writes a processed text as a document per chunk, with the chunk's vector, and a manifest", async () => {
    await upload('notes.txt', notes);

    const [manifest, first] = ids(text(notes), 2);
    await indexed(sha256(notes), ids(text(notes), 2));
    const { body } = await opensearch.get({ index, id: manifest });
    expect(body._source).toEqual({ ...text(notes), chunks: 2 });
    const chunk = (await opensearch.get({ index, id: first })).body._source!;
    const [vector] = await new FakeEmbedder(testVectors.dimensions).embed([
      'search index: page one',
    ]);
    // as float32
    expect(chunk.vector).toEqual(vector.map((x) => expect.closeTo(x, 6)));
  });

  it('writes a text of more chunks than a bulk request takes', async () => {
    await upload('book.txt', book);

    await indexed(sha256(book), ids(text(book), 250));
  });

  it('writes the manifest alone for content a processor found no text in', async () => {
    await upload('scan.pdf', scan);

    await indexed(sha256(scan), ids(text(scan, 1, 'fake-pdf'), 0));
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
    await indexed(sha256(scan), ids(text(scan, 1, 'fake-pdf'), 0));
    await indexed(sha256(book), []);
  });

  it("writes a post as it's ingested or edited, with its chunks' vectors, and takes it out once it's removed", async () => {
    await post('notice', '<p>search index: a post</p>');
    const id = await idOf('item', 'notice');
    const text = 'Notice\n\nsearch index: a post';
    const [vector] = await new FakeEmbedder(testVectors.dimensions).embed([
      text,
    ]);

    await recorded('post', id, {
      [`post__${id}`]: expect.objectContaining({ kind: 'post', chunks: 1 }),
      [`post__${id}__0`]: {
        kind: 'post',
        record: id,
        digest: expect.any(String),
        hash: sha256(`post:${id}`),
        chunk: 0,
        text,
        // as float32
        vector: vector.map((x) => expect.closeTo(x, 6)),
      },
    });

    await post('notice', '<p>search index: the post, edited</p>');
    await recorded('post', id, {
      [`post__${id}`]: expect.anything(),
      [`post__${id}__0`]: expect.objectContaining({
        text: 'Notice\n\nsearch index: the post, edited',
      }),
    });

    // past its text: a link, which isn't words
    const before = await record('post', id);
    await hub.item({
      externalId: 'notice',
      kind: 'post',
      title: 'Notice',
      raw: {
        body: '<p>search index: the post, edited</p>',
        url: 'https://portal.example/notice',
      },
    });
    await vi.waitFor(
      async () =>
        expect((await record('post', id))[`post__${id}`].fingerprint).not.toBe(
          before[`post__${id}`].fingerprint,
        ),
      WAIT,
    );
    expect((await record('post', id))[`post__${id}__0`]).toEqual(
      before[`post__${id}__0`],
    );

    await hub.removeItem('notice');
    await recorded('post', id, {});
  });

  // the tree's after the processors' and the unpacker's jobs
  it("writes a file's name once its content is stored, and its tree's kept members' paths, by words alone", async () => {
    const bundle = JSON.stringify({ 'lab/main.txt': 'int main' });
    await upload('labs.bundle', bundle);
    const file = await idOf('file', 'labs.bundle');

    await recorded('file', file, {
      [`file__${file}`]: expect.objectContaining({ chunks: 1 }),
      [`file__${file}__0`]: {
        kind: 'file',
        record: file,
        digest: expect.any(String),
        hash: sha256(bundle),
        chunk: 0,
        text: 'labs.bundle',
      },
    });
    await recorded('tree', sha256(bundle), {
      [`tree__${sha256(bundle)}`]: expect.objectContaining({
        fingerprint: 'fake-bundle__1__1',
        chunks: 1,
      }),
      [`tree__${sha256(bundle)}__0`]: expect.objectContaining({
        hash: sha256('int main'),
        text: 'lab/main.txt',
        member: 'lab/main.txt',
      }),
    });

    await hub.removeFile('labs.bundle');
    await recorded('file', file, {});
  });

  it('puts the records back in step: lost, made from what changed since, or of nothing postgres has', async () => {
    await post('kept', 'search index: a post kept');
    const id = await idOf('item', 'kept');
    await recorded('post', id, {
      [`post__${id}`]: expect.anything(),
      [`post__${id}__0`]: expect.anything(),
    });
    const tree = sha256(JSON.stringify({ 'lab/main.txt': 'int main' }));
    await opensearch.deleteByQuery({
      index,
      refresh: true,
      body: { query: { term: { record: id } } },
    });
    await opensearch.index({
      index,
      id: `tree__${tree}`,
      body: { kind: 'tree', record: tree, fingerprint: 'before', chunks: 0 },
    });
    await opensearch.index({
      index,
      id: 'post__gone',
      body: { kind: 'post', record: 'gone', fingerprint: 'x', chunks: 0 },
      refresh: true,
    });

    expect(await app.get(ReconcileIndex).run()).toBeGreaterThanOrEqual(3);

    await recorded('post', id, {
      [`post__${id}`]: expect.anything(),
      [`post__${id}__0`]: expect.anything(),
    });
    await recorded('tree', tree, {
      [`tree__${tree}`]: expect.objectContaining({
        fingerprint: 'fake-bundle__1__1',
      }),
      [`tree__${tree}__0`]: expect.anything(),
    });
    await recorded('post', 'gone', {});
  });

  // fields added need no new generation: the texts in it are kept
  it("gives an index this generation made before the records' fields those fields", async () => {
    await deleteIndex();
    const body = indexBody(testVectors);
    const { kind, record, fingerprint, digest, member, ...before } =
      body.mappings.properties;
    await opensearch.indices.create({
      index,
      body: { ...body, mappings: { ...body.mappings, properties: before } },
    });
    await opensearch.index({
      index,
      id: 'kept',
      body: { ...text(notes, 2), chunks: 0 },
      refresh: true,
    });

    await app.get(TextIndex).ensure();

    const { body: mapping } = await opensearch.indices.getMapping({ index });
    expect(mapping[index].mappings.properties).toMatchObject({
      kind,
      record,
      fingerprint,
      digest,
      member,
    });
    expect((await opensearch.exists({ index, id: 'kept' })).body).toBe(true);
  });

  it('makes the index again when it was deleted while the app runs', async () => {
    await deleteIndex();
    const after = 'search index: written after the index was deleted';

    await upload('after.txt', after);

    await indexed(sha256(after), ids(text(after), 1));
    const { body } = await opensearch.indices.getMapping({ index });
    expect(body[index].mappings._meta).toEqual({
      generation: GENERATION,
      ...testVectors,
    });

    // and a reconcile fills it anew
    await deleteIndex();
    await app.get(ReconcileIndex).run();

    await indexed(sha256(notes), ids(text(notes, 2), 1));
    await indexed(sha256(after), ids(text(after), 1));
  });
});
