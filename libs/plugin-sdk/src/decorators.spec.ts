import type { ConnectorContext } from './connectors.js';
import {
  Aggregator,
  ContentProcessor,
  PollConnector,
  PushConnector,
} from './decorators.js';

// These are checked by tsc (npm run typecheck): every @ts-expect-error must
// stay an error, otherwise the decorators stopped guarding plugin classes,
// and the hub doesn't check again at runtime.
describe('plugin decorators', () => {
  it('fit only classes that implement their kind', () => {
    // @ts-expect-error a poll connector needs poll()
    @PollConnector({ portal: 'a', schedule: '* * * * *' })
    class PollWithoutPoll {
      start() {}
    }

    // @ts-expect-error a push connector needs start() and stop()
    @PushConnector({ portal: 'b' })
    class PushWithoutStop {
      start() {}
    }

    // @ts-expect-error a processor needs process()
    @ContentProcessor({ name: 'c', version: 1, accepts: ['.pdf'] })
    class ProcessorWithoutProcess {}

    // @ts-expect-error an aggregator needs handle()
    @Aggregator({ name: 'd', topics: ['item.ingested'] })
    class AggregatorWithoutHandle {}

    // @ts-expect-error a topic that doesn't exist
    @Aggregator({ name: 'f', topics: ['course.ingested'] })
    class UnknownTopic {
      async handle() {}
    }

    @PollConnector({ portal: 'e', schedule: '* * * * *' })
    class Fine {
      async poll(ctx: ConnectorContext) {
        await ctx.ingest.state();
      }
    }

    expect([
      PollWithoutPoll,
      PushWithoutStop,
      ProcessorWithoutProcess,
      AggregatorWithoutHandle,
      UnknownTopic,
      Fine,
    ]).toHaveLength(6);
  });
});
