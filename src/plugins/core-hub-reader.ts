import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { HubReader } from '@app/plugin-sdk';
import {
  GetFileQuery,
  GetItemQuery,
  GetPortalCourseQuery,
} from '../catalog/contracts.js';
import { GetContentQuery } from '../storage/contracts.js';

// what plugins can read, as sdk views of catalog's dtos
@Injectable()
export class CoreHubReader extends HubReader {
  constructor(private readonly queries: QueryBus) {
    super();
  }

  async course(id: string) {
    return this.queries.execute(new GetPortalCourseQuery(id));
  }

  async item(id: string) {
    const item = await this.queries.execute(new GetItemQuery(id));
    if (!item) return null;
    const { portalCourseId, ...rest } = item;
    return { ...rest, courseId: portalCourseId };
  }

  async file(id: string) {
    const file = await this.queries.execute(new GetFileQuery(id));
    if (!file) return null;
    const { portalCourseId, ...rest } = file;
    return { ...rest, courseId: portalCourseId };
  }

  content(hash: string) {
    return this.queries.execute(new GetContentQuery(hash));
  }
}
