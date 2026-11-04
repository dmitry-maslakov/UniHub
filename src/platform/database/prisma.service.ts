import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { databaseConfig } from './database.config.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(
    @Inject(databaseConfig.KEY) { url }: ConfigType<typeof databaseConfig>,
  ) {
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // not onModuleDestroy: queue workers finish their jobs in
  // onApplicationShutdown and may still need the database
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}

// What repositories write through: the transaction of the current unit of
// work, or the client outside one. Inject it with @InjectTransactionHost():
// a type alias carries no runtime type for Nest to inject by.
export type PrismaTxHost = TransactionHost<
  TransactionalAdapterPrisma<PrismaService>
>;
