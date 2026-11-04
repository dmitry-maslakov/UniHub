import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ContentHash } from '@app/kernel';
import { HubReader } from '@app/plugin-sdk';
import {
  GetFileQuery,
  GetItemQuery,
  GetPortalCourseQuery,
} from '../../../catalog/contracts.js';
import { BlobStore } from '../../../storage/contracts.js';
import { courseView, fileView, itemView } from './views.js';

// what plugins can read
@Injectable()
export class CoreHubReader extends HubReader {
  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
  ) {
    super();
  }

  async course(id: string) {
    const course = await this.queries.execute(new GetPortalCourseQuery(id));
    return course && courseView(course);
  }

  async item(id: string) {
    const item = await this.queries.execute(new GetItemQuery(id));
    return item && itemView(item);
  }

  async file(id: string) {
    const file = await this.queries.execute(new GetFileQuery(id));
    return file && fileView(file);
  }

  // async, so a malformed hash rejects like any other failure
  async content(hash: string) {
    return this.blobs.get(ContentHash.parse(hash));
  }
}
