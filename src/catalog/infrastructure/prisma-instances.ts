import { Injectable } from '@nestjs/common';
import {
  InjectTransactionHost,
  Propagation,
  Transactional,
} from '@nestjs-cls/transactional';
import { NO_INSTANCE, type Instance, type PortalId } from '@app/kernel';
import type { PrismaTxHost } from '../../platform/database/prisma.service.js';
import { Instances } from '../domain/instances.js';

// A record's site is stamped on its ids alone (PortalCourse, Item, File):
// its versions and sights, the events and the search index name the hub's
// ids, which stay.
@Injectable()
export class PrismaInstances extends Instances {
  constructor(@InjectTransactionHost() private readonly txHost: PrismaTxHost) {
    super();
  }

  @Transactional(Propagation.Mandatory)
  async adopt(portal: PortalId, instance: Instance) {
    const { tx } = this.txHost;
    const where = { portal, instance: NO_INSTANCE };
    const data = { instance };
    const counts = [
      await tx.portalCourse.updateMany({ where, data }),
      await tx.item.updateMany({ where, data }),
      await tx.file.updateMany({ where, data }),
    ];
    return counts.reduce((sum, { count }) => sum + count, 0);
  }
}
