import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { Dispatch } from './dispatch.js';
import {
  FakeFiles,
  FakeQueue,
  InMemoryRepresentations,
  sha,
} from './processing.fakes.js';
import { Reconcile } from './reconcile.js';

describe('Reconcile', () => {
  it('queues the processing missing for files with content', async () => {
    const plugins = catalogOf({
      processors: [processor('pdf', ['.pdf']), processor('slides', ['.pptx'])],
    });
    const files = new FakeFiles(
      new Map([
        ['a', { name: 'a.pdf', mime: null, hash: sha('a') }],
        ['b', { name: 'b.pptx', mime: null, hash: sha('b') }],
        ['c', { name: 'c.txt', mime: null, hash: sha('c') }],
      ]),
    );
    const representations = new InMemoryRepresentations();
    await representations.save({
      hash: sha('b'),
      processor: PluginName.parse('slides'),
      version: 1,
      parts: [],
    });
    const queue = new FakeQueue();

    const queued = await new Reconcile(
      files,
      new Dispatch(plugins, files),
      representations,
      queue,
    ).run();

    expect(queued).toBe(1);
    expect(queue.requeued).toEqual([
      {
        kind: 'process',
        key: { hash: sha('a'), processor: 'pdf', version: 1 },
      },
    ]);
    expect(queue.enqueued).toEqual([]);
  });
});
