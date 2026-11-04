import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type { HandlesMessages, ProcessesContent, Topic } from '@app/plugin-sdk';
import { ContentHash, PluginName } from '@app/kernel';
import { PluginCatalog } from '../../plugins/contracts.js';
import { BlobStore } from '../../storage/contracts.js';
import {
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';
import type { PluginJob } from './plugin-job.js';
import { FileFacts, PluginJobQueue, type FileFact } from './ports.js';

// In-memory ports for the application's unit tests.

export const sha = (text: string) =>
  ContentHash.parse(createHash('sha256').update(text).digest('hex'));

// a processor of one extension; its spec as plugins would check it
export const processor = (
  name: string,
  ext: string,
  instance: ProcessesContent = { process: async () => ({ parts: [] }) },
  version = 1,
) => ({
  spec: {
    name: PluginName.parse(name),
    version,
    match: (file: FileFact) => (file.name.endsWith(ext) ? ext : null),
  },
  instance,
});

export const aggregator = (
  name: string,
  topics: Topic[],
  instance: HandlesMessages = { handle: async () => {} },
) => ({ spec: { name: PluginName.parse(name), topics }, instance });

// the catalog the app would make of these plugins
export function catalogOf(plugins: {
  processors?: ReturnType<typeof processor>[];
  aggregators?: ReturnType<typeof aggregator>[];
}) {
  const found = { polls: [], pushes: [], processors: [], aggregators: [] };
  const catalog = new PluginCatalog(
    { find: () => ({ ...found, ...plugins }) } as never,
    { portals: () => [] } as never,
  );
  catalog.onModuleInit();
  return catalog;
}

// catalog's files by id; a removed one is left out
export class FakeFiles extends FileFacts {
  constructor(
    readonly files = new Map<string, FileFact & { hash: ContentHash }>(),
  ) {
    super();
  }

  async file(id: string) {
    return this.files.get(id) ?? null;
  }

  async holding(hash: ContentHash) {
    return [...this.files.values()].filter((file) => file.hash === hash);
  }

  async *withContent() {
    yield* this.files.values();
  }
}

export class FakeQueue extends PluginJobQueue {
  readonly enqueued: PluginJob[] = [];
  readonly requeued: PluginJob[] = [];

  async enqueue(jobs: readonly PluginJob[]) {
    this.enqueued.push(...jobs);
  }

  async requeue(job: PluginJob) {
    this.requeued.push(job);
  }
}

const same = (a: RepresentationKey, b: RepresentationKey) =>
  a.hash === b.hash && a.processor === b.processor && a.version === b.version;

export class InMemoryRepresentations extends RepresentationRepository {
  readonly saved: Representation[] = [];

  async exists(key: RepresentationKey) {
    return this.saved.some((saved) => same(saved, key));
  }

  async save(representation: Representation) {
    this.saved.push(representation);
  }
}

// every stream it handed out, to see they were closed
export class FakeBlobs extends BlobStore {
  readonly maxBytes = 1024;
  readonly opened: PassThrough[] = [];

  async put(): Promise<never> {
    throw new Error('processing only reads content');
  }

  async get() {
    const stream = new PassThrough();
    this.opened.push(stream);
    return stream;
  }
}
