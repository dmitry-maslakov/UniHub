import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(config: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // whether the database answers at all, to tell an outage from a failure;
  // a database that doesn't answer in time counts as away
  async isReachable(timeoutMs = 5_000): Promise<boolean> {
    const ping = this.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    );
    const late = new Promise<false>((resolve) =>
      setTimeout(resolve, timeoutMs, false).unref(),
    );
    return Promise.race([ping, late]);
  }

  // not onModuleDestroy: queue workers finish their jobs in
  // onApplicationShutdown and may still need the database
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
