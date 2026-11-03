import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { UserRepository } from '../domain/user.js';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {
    super();
  }

  async findById(id: string) {
    const row = await this.txHost.tx.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    return (
      row && {
        id: row.id,
        roles: (row.role ?? '')
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
      }
    );
  }
}
