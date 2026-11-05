import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import {
  OutboxModule,
  OutboxPublishTimeoutError,
  OutboxStorage,
} from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { PrismaService } from '../database/prisma.service.js';
import { isConnectionError } from '../errors/is-connection-error.js';
import { roleConfig } from '../role/role.config.js';
import { OutboxRetention } from './outbox-retention.js';

// the transports, and the modules whose exports they inject
type Wiring = Pick<
  NonNullable<Parameters<typeof OutboxModule.forRoot>[0]>,
  'transports' | 'imports'
>;

// The outbox: modules add messages in their own transactions, the relay
// publishes them to the transports AppModule names (and the modules those
// inject from). One transport so far, so no route.
@Module({})
export class MessagingModule {
  static forRoot({ transports, imports = [] }: Wiring): DynamicModule {
    return {
      module: MessagingModule,
      imports: [
        OutboxModule.forRootAsync({
          transports,
          imports: [...imports, ConfigModule.forFeature(roleConfig)],
          inject: [roleConfig.KEY],
          useFactory: ({ worker }: ConfigType<typeof roleConfig>) => ({
            relay: {
              // It queues the plugins' jobs, background work, so it runs
              // where the workers do, as the outbox advises for api-only
              // processes: an api one only adds messages, which the worker's
              // relay finds on its next poll. Relays may run side by side
              // (claims leased under FOR UPDATE SKIP LOCKED, writes fenced by
              // the lease), so each of several workers may run one.
              enabled: worker,
              pollInterval: '1s',
            },
            retry: {
              // the attempt limit always applies, so it is set high and
              // retryIf decides: ten tries, or for as long as redis is
              // unreachable (with maxRetriesPerRequest: null that shows up as
              // a publish timeout)
              attempts: 10_000,
              retryIf: (error, attempt) =>
                attempt < 10 ||
                error instanceof OutboxPublishTimeoutError ||
                isConnectionError(error),
              backoff: { delay: '1s', maxDelay: '1m' },
            },
          }),
        }),
      ],
      providers: [
        {
          // messages live in our postgres, in a schema of their own (nest_outbox)
          provide: PostgresOutboxStore,
          inject: [PrismaService, OutboxStorage],
          useFactory: (prisma: PrismaService, storage: OutboxStorage) =>
            new PostgresOutboxStore({ executor: fromPrisma(prisma) }, storage),
        },
        OutboxRetention,
      ],
    };
  }
}
