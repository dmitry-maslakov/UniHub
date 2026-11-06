import { PortalId } from '@app/kernel';
import { sha256 } from '../../../test/sha256.js';
import { IndexMessages, recordOf } from './index-messages.js';
import { FakeTextIndexQueue } from './processing.fakes.js';

const portal = PortalId.parse('canvas');

describe('IndexMessages', () => {
  it("takes an item's messages for its post, a file's for its name", () => {
    for (const topic of ['item.ingested', 'item.removed'] as const)
      expect(recordOf({ topic, payload: { portal, itemId: 'i1' } })).toEqual({
        kind: 'post',
        id: 'i1',
      });
    expect(
      recordOf({
        topic: 'file.content-stored',
        payload: { portal, fileId: 'f1', hash: sha256('x') },
      }),
    ).toEqual({ kind: 'file', id: 'f1' });
    expect(
      recordOf({ topic: 'file.removed', payload: { portal, fileId: 'f1' } }),
    ).toEqual({ kind: 'file', id: 'f1' });
  });

  // a change while the record's job runs is a job more, a message the
  // relay publishes again isn't
  it("queues the record's job under the message's id", async () => {
    const queue = new FakeTextIndexQueue();

    await new IndexMessages(queue).publish('m1', {
      topic: 'item.ingested',
      payload: { portal, itemId: 'i1' },
    });

    expect(queue.records).toEqual([
      { ref: { kind: 'post', id: 'i1' }, change: 'm1' },
    ]);
  });

  it('queues nothing with search off', async () => {
    await expect(
      new IndexMessages().publish('m1', {
        topic: 'item.removed',
        payload: { portal, itemId: 'i1' },
      }),
    ).resolves.toBeUndefined();
  });
});
