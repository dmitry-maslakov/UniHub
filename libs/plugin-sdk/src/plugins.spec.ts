import {
  Aggregator,
  ContentProcessor,
  PollConnector,
  PushConnector,
  type ConnectorContext,
} from './plugins.js';

// These are checked by tsc (npm run typecheck): every @ts-expect-error must
// stay an error, otherwise the decorators stopped guarding plugin classes.
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
      Fine,
    ]).toHaveLength(5);
  });
});
