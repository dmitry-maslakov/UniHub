import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PortalPicks } from './portal-picks.js';
import { WantedCoursesQuery } from './queries.js';

@QueryHandler(WantedCoursesQuery)
export class WantedCoursesHandler implements IQueryHandler<WantedCoursesQuery> {
  constructor(private readonly picks: PortalPicks) {}

  execute({ portal }: WantedCoursesQuery) {
    return this.picks.wantedOf(portal);
  }
}
