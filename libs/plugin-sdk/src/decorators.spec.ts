import type { Credential } from './accounts.js';
import type { ConnectorContext } from './connectors.js';
import {
  Aggregator,
  ContentProcessor,
  ContentUnpacker,
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

    // @ts-expect-error an unpacker needs unpack()
    @ContentUnpacker({ name: 'j', version: 1, accepts: ['.zip'] })
    class UnpackerWithoutUnpack {}

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
      UnpackerWithoutUnpack,
      Fine,
    ]).toHaveLength(6);
  });

  it('fit a connector that names links only if it identifies accounts', () => {
    // @ts-expect-error links by token, but can't say whose a token is
    @PollConnector({ portal: 'k', schedule: '* * * * *', links: ['token'] })
    class PollWithoutIdentify {
      async poll() {}
    }

    // @ts-expect-error the same for a push connector
    @PushConnector({ portal: 'l', links: ['token'] })
    class PushWithoutIdentify {
      async run() {}
    }

    // @ts-expect-error a link no connector can take
    @PushConnector({ portal: 'm', links: ['password'] })
    class UnknownLink {
      async run() {}
    }

    @PollConnector({ portal: 'n', schedule: '* * * * *', links: ['token'] })
    class Identifies {
      async poll() {}
      async identify({ token }: Credential) {
        return { id: token.reveal().length.toString(), expiresAt: null };
      }
    }

    expect([
      PollWithoutIdentify,
      PushWithoutIdentify,
      UnknownLink,
      Identifies,
    ]).toHaveLength(4);
  });

  it('fit a connector of a portal with instances only if it says which its settings read', () => {
    // @ts-expect-error a portal with instances, and no configuredInstance()
    @PollConnector({ portal: 'o', schedule: '* * * * *', instances: true })
    class PollWithoutInstance {
      async poll() {}
    }

    // @ts-expect-error the same for a push connector
    @PushConnector({ portal: 'p', instances: true })
    class PushWithoutInstance {
      async run() {}
    }

    @PollConnector({
      portal: 'q',
      schedule: '* * * * *',
      links: ['token'],
      instances: true,
    })
    class Configured {
      async poll() {}
      async identify() {
        return { id: '1', expiresAt: null };
      }
      configuredInstance() {
        return null;
      }
    }

    expect([PollWithoutInstance, PushWithoutInstance, Configured]).toHaveLength(
      3,
    );
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
