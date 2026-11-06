import { PluginName } from '@app/kernel';
import {
  catalogOf,
  expander,
  processor,
} from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import { Dispatch } from './dispatch.js';
import {
  FakeFiles,
  FakeQueue,
  InMemoryExpansions,
  InMemoryRepresentations,
  namesOf,
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
      namesOf(files, plugins),
      new Dispatch(plugins, files),
      representations,
      new InMemoryExpansions(),
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

  it("queues a missing expansion, and the processing of an expanded archive's entries", async () => {
    const plugins = catalogOf({
      processors: [processor('text', ['.c'])],
      expanders: [expander('archives', ['.zip'])],
    });
    const files = new FakeFiles(
      new Map([
        ['a', { name: 'a.zip', mime: null, hash: sha256('a') }],
        ['b', { name: 'b.zip', mime: null, hash: sha256('b') }],
      ]),
    );
    const expansions = new InMemoryExpansions();
    await expansions.save({
      hash: sha256('b'),
      expander: PluginName.parse('archives'),
      version: 1,
      entries: [{ path: 'lab/main.c', hash: sha256('main'), size: 4 }],
    });
    const queue = new FakeQueue();

    await new Reconcile(
      namesOf(files, plugins, expansions),
      new Dispatch(plugins, files),
      new InMemoryRepresentations(),
      expansions,
      queue,
    ).run();

    expect(queue.requeued).toEqual([
      {
        kind: 'expand',
        key: { hash: sha256('a'), expander: 'archives', version: 1 },
      },
      {
        kind: 'process',
        key: { hash: sha256('main'), processor: 'text', version: 1 },
      },
    ]);
  });
});
