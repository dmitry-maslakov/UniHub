import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ContentHash } from '@app/kernel';
import {
  HubReader,
  type CourseView,
  type FileView,
  type ItemView,
} from '@app/plugin-sdk';
import {
  GetFileQuery,
  GetItemQuery,
  GetPortalCourseQuery,
} from '../catalog/contracts.js';
import { BlobStore } from '../storage/contracts.js';

// What plugins can read. Copied field by field, so a field added to catalog's
// dtos doesn't reach plugins without the sdk saying so.
@Injectable()
export class CoreHubReader extends HubReader {
  constructor(
    private readonly queries: QueryBus,
    private readonly blobs: BlobStore,
  ) {
    super();
  }

  async course(id: string): Promise<CourseView | null> {
    const c = await this.queries.execute(new GetPortalCourseQuery(id));
    return (
      c && {
        id: c.id,
        portal: c.portal,
        externalId: c.externalId,
        name: c.name,
        url: c.url,
        meta: c.meta,
      }
    );
  }

  async item(id: string): Promise<ItemView | null> {
    const i = await this.queries.execute(new GetItemQuery(id));
    return (
      i && {
        id: i.id,
        portal: i.portal,
        externalId: i.externalId,
        portalCourseId: i.portalCourseId,
        kind: i.kind,
        title: i.title,
        url: i.url,
        publishedAt: i.publishedAt,
        raw: i.raw,
        removed: i.removed,
      }
    );
  }

  async file(id: string): Promise<FileView | null> {
    const f = await this.queries.execute(new GetFileQuery(id));
    return (
      f && {
        id: f.id,
        portal: f.portal,
        externalId: f.externalId,
        portalCourseId: f.portalCourseId,
        itemId: f.itemId,
        name: f.name,
        path: f.path,
        url: f.url,
        size: f.size,
        mime: f.mime,
        contentHash: f.contentHash,
        removed: f.removed,
      }
    );
  }

  content(hash: string) {
    return this.blobs.get(ContentHash.parse(hash));
  }
}
