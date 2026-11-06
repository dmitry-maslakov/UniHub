import { PluginName } from '@app/kernel';
import {
  catalogOf,
  processor,
  unpacker,
} from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import { LIMITS } from '../domain/tree-budget.js';
import type { Unpacking } from '../domain/unpacking.js';
import { Dispatch } from './dispatch.js';
import {
  FakeFiles,
  FakeQueue,
  InMemoryRepresentations,
  InMemoryUnpackings,
} from './processing.fakes.js';
import { Reconcile } from './reconcile.js';

describe('Reconcile', () => {
  it('queues the processing missing for files with content', async () => {
    const plugins = catalogOf({
      processors: [processor('pdf', ['.pdf']), processor('slides', ['.pptx'])],
    });
    const files = new FakeFiles(
      new Map([
        ['a', { name: 'a.pdf', mime: null, hash: sha256('a') }],
        ['b', { name: 'b.pptx', mime: null, hash: sha256('b') }],
        ['c', { name: 'c.txt', mime: null, hash: sha256('c') }],
      ]),
    );
    const representations = new InMemoryRepresentations();
    await representations.save({
      hash: sha256('b'),
      processor: PluginName.parse('slides'),
      version: 1,
      parts: [],
    });
    const queue = new FakeQueue();

    const queued = await new Reconcile(
      files,
      new Dispatch(plugins, files),
      representations,
      new InMemoryUnpackings(),
      queue,
    ).run();

    expect(queued).toBe(1);
    expect(queue.requeued).toEqual([
      {
        kind: 'process',
        key: { hash: sha256('a'), processor: 'pdf', version: 1 },
      },
    ]);
    expect(queue.enqueued).toEqual([]);
  });

  it('queues the trees missing or made under other limits, then their members processing', async () => {
    const plugins = catalogOf({
      processors: [processor('text', ['.c'])],
      unpackers: [unpacker('bundle', ['.bundle'])],
    });
    const files = new FakeFiles(
      new Map(
        ['new', 'old', 'current'].map((name) => [
          name,
          { name: `${name}.bundle`, mime: null, hash: sha256(name) },
        ]),
      ),
    );
    const tree = (name: string, policy = LIMITS.policy): Unpacking => ({
      hash: sha256(name),
      unpacker: PluginName.parse('bundle'),
      version: 1,
      policy,
      members: [
        {
          path: 'src/main.c',
          hash: sha256(`${name}.c`),
          size: 1,
          mime: null,
          leftOut: null,
        },
        {
          path: 'big.c',
          hash: null,
          size: 9,
          mime: null,
          leftOut: 'TOO_LARGE',
        },
      ],
      cutShort: null,
    });
    const unpackings = new InMemoryUnpackings();
    await unpackings.save(tree('old', LIMITS.policy - 1));
    await unpackings.save(tree('current'));
    const queue = new FakeQueue();

    const queued = await new Reconcile(
      files,
      new Dispatch(plugins, files),
      new InMemoryRepresentations(),
      unpackings,
      queue,
    ).run();

    expect(queued).toBe(3);
    expect(queue.requeued).toEqual([
      ...['new', 'old'].map((name) => ({
        kind: 'unpack',
        key: { hash: sha256(name), unpacker: 'bundle', version: 1 },
        policy: LIMITS.policy,
      })),
      {
        kind: 'process',
        key: { hash: sha256('current.c'), processor: 'text', version: 1 },
      },
    ]);
  });
});
