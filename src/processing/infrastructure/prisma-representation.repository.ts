import { Injectable } from '@nestjs/common';
import { InjectTransactionHost } from '@nestjs-cls/transactional';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import {
  RepresentationRepository,
  type Representation,
  type RepresentationKey,
} from '../domain/representation.js';

const byKey = ({ hash, processor, version }: RepresentationKey) => ({
  hash_processor_version: { hash, processor, version },
});

@Injectable()
export class PrismaRepresentationRepository extends RepresentationRepository {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  async exists(key: RepresentationKey) {
    const row = await this.txHost.tx.representation.findUnique({
      where: byKey(key),
      select: { hash: true },
    });
    return row !== null;
  }

  async save({ parts, ...key }: Representation) {
    await this.txHost.tx.representation.upsert({
      where: byKey(key),
      create: { ...key, parts },
      update: { parts },
    });
  }
}
