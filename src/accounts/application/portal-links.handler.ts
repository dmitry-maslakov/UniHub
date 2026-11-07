import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { LinkMode, PortalId } from '@app/kernel';
import { PortalLinks } from '../domain/portal-links.js';
import { PortalLinksQuery } from './queries.js';

@QueryHandler(PortalLinksQuery)
export class PortalLinksHandler implements IQueryHandler<PortalLinksQuery> {
  constructor(private readonly links: PortalLinks) {}

  execute({ portals }: PortalLinksQuery) {
    return Promise.resolve(
      new Map<PortalId, { mode: LinkMode; label: string }>(
        portals.map((portal) => [
          portal,
          { mode: this.links.of(portal).mode, label: this.links.label(portal) },
        ]),
      ),
    );
  }
}
