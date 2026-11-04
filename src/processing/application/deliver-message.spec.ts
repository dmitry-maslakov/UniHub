import { ITEM_INGESTED, type Message } from '@app/plugin-sdk';
import { PluginName, PortalId } from '@app/kernel';
import { aggregator, catalogOf } from '../../../test/discovered-plugins.js';
import { DeliverMessage } from './deliver-message.js';

const message: Message = {
  topic: ITEM_INGESTED,
  payload: { portal: PortalId.parse('canvas'), itemId: 'i1' },
};

const job = (name: string) => ({
  kind: 'handle' as const,
  messageId: 'm1',
  aggregator: PluginName.parse(name),
  message,
});

describe('DeliverMessage', () => {
  const handle = vi.fn(async () => {});
  const deliver = new DeliverMessage(
    catalogOf({
      aggregators: [aggregator('feed', [ITEM_INGESTED], { handle })],
    }),
  );

  it('hands the message to its aggregator', async () => {
    await deliver.run(job('feed'));
    expect(handle).toHaveBeenCalledWith(message);
  });

  it('hands it to nobody once the aggregator is turned off', async () => {
    handle.mockClear();
    await deliver.run(job('gone'));
    expect(handle).not.toHaveBeenCalled();
  });
});
