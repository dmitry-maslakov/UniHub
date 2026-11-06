import type { ConnectorContext } from './connectors.js';
import {
  Aggregator,
  ContentExpander,
  ContentProcessor,
  PollConnector,
  PushConnector,
} from './decorators.js';
import { ITEM_INGESTED, ITEM_REMOVED, type Message } from './messages.js';

// These are checked by tsc (npm run typecheck): every @ts-expect-error must
// stay an error, otherwise the decorators stopped guarding plugin classes,
// and the hub doesn't check again at runtime.
describe('plugin decorators', () => {
  it('fit only classes that implement their kind', () => {
    // @ts-expect-error a poll connector needs poll()
    @PollConnector({ portal: 'a', schedule: '* * * * *' })
    class PollWithoutPoll {
      async run() {}
    }

    // @ts-expect-error a push connector needs run(), start() is gone
    @PushConnector({ portal: 'b' })
    class PushWithStart {
      start() {}
      stop() {}
    }

    // @ts-expect-error a processor needs process()
    @ContentProcessor({ name: 'c', version: 1, accepts: ['.pdf'] })
    class ProcessorWithoutProcess {}

    // @ts-expect-error an aggregator needs handle()
    @Aggregator({ name: 'd', topics: [ITEM_INGESTED] })
    class AggregatorWithoutHandle {}

    // @ts-expect-error an expander needs expand()
    @ContentExpander({ name: 'j', version: 1, accepts: ['.zip'] })
    class ExpanderWithoutExpand {}

    @PollConnector({ portal: 'e', schedule: '* * * * *' })
    class Fine {
      async poll(ctx: ConnectorContext) {
        await ctx.ingest.state();
      }
    }

    expect([
      PollWithoutPoll,
      PushWithStart,
      ProcessorWithoutProcess,
      AggregatorWithoutHandle,
      ExpanderWithoutExpand,
      Fine,
    ]).toHaveLength(6);
  });

  it('give an aggregator the messages of its topics', () => {
    // @ts-expect-error a topic that doesn't exist
    @Aggregator({ name: 'f', topics: ['course.ingested'] })
    class UnknownTopic {
      async handle() {}
    }

    // @ts-expect-error it listens to item.removed but handles only item.ingested
    @Aggregator({ name: 'g', topics: [ITEM_INGESTED, ITEM_REMOVED] })
    class HandlesTooFew {
      async handle(message: Message<typeof ITEM_INGESTED>) {
        void message.payload.itemId;
      }
    }

    @Aggregator({ name: 'h', topics: [ITEM_INGESTED, ITEM_REMOVED] })
    class HandlesBoth {
      async handle(message: Message<'item.ingested' | 'item.removed'>) {
        void message.payload.itemId;
      }
    }

    @Aggregator({ name: 'i', topics: [ITEM_INGESTED] })
    class HandlesAny {
      async handle(message: Message) {
        void message.topic;
      }
    }

    expect([UnknownTopic, HandlesTooFew, HandlesBoth, HandlesAny]).toHaveLength(
      4,
    );
  });
});
