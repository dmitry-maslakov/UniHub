import type { Queue } from 'bullmq';
import { PluginName } from '@app/kernel';
import { catalogOf, processor } from '../../../test/discovered-plugins.js';
import { sha256 } from '../../../test/sha256.js';
import type { PluginJob } from '../application/plugin-job.js';
import { BullmqPluginJobQueue } from './bullmq-plugin-job-queue.js';

const process = (name: string): PluginJob => ({
  kind: 'process',
  key: { hash: sha256('a'), processor: PluginName.parse(name), version: 1 },
});

const fakeQueue = () => ({ addBulk: vi.fn(), add: vi.fn() });

describe('BullmqPluginJobQueue', () => {
  const main = fakeQueue();
  const models = fakeQueue();
  const queue = new BullmqPluginJobQueue(
    main as unknown as Queue<PluginJob>,
    models as unknown as Queue<PluginJob>,
    catalogOf({
      processors: [
        processor('pdf', ['.pdf']),
        processor('ocr', ['.png'], undefined, 1, { timeoutMinutes: 20 }),
      ],
    }),
  );

  beforeEach(() => vi.clearAllMocks());

  const names = (add: ReturnType<typeof vi.fn>) =>
    add.mock.calls.flatMap(([jobs]) =>
      (jobs as { name: string }[]).map((j) => j.name),
    );

  it("queues a heavy processor's jobs apart, so `plugins` never holds one", async () => {
    await queue.enqueue([process('pdf'), process('ocr')]);

    expect(names(main.addBulk)).toEqual(['pdf']);
    expect(names(models.addBulk)).toEqual(['ocr']);
  });

  it('queues a job again in the queue it belongs to', async () => {
    await queue.requeue(process('ocr'));
    await queue.requeue(process('pdf'));

    expect(models.add).toHaveBeenCalledOnce();
    expect(models.add.mock.calls[0]![0]).toBe('ocr');
    expect(main.add).toHaveBeenCalledOnce();
    expect(main.add.mock.calls[0]![0]).toBe('pdf');
  });
});
