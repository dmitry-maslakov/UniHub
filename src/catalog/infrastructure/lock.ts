import type { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';

export type TxHost = TransactionHost<TransactionalAdapterPrisma<PrismaService>>;

export const LOCK = { course: 1, item: 2, file: 3 } as const;

// Two ingests of the same record at once would both read "not there" and
// collide on insert, or both emit a change. The lock serialises them until
// the transaction ends; without a transaction it would do nothing.
export async function lockRecord(
  txHost: TxHost,
  kind: (typeof LOCK)[keyof typeof LOCK],
  portal: string,
  externalId: string,
) {
  if (!txHost.isTransactionActive())
    throw new Error('catalog upserts must run in a transaction');
  await txHost.tx
    .$executeRaw`SELECT pg_advisory_xact_lock(${kind}::int, hashtext(${`${portal}:${externalId}`}))`;
}
