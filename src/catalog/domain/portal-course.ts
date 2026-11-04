import type { Json } from '@app/kernel';
import type { Upserted } from './changes.js';

// a course as it exists in one portal
export interface PortalCourse {
  id: string;
  portal: string;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export type PortalCourseData = Omit<PortalCourse, 'id'>;

export abstract class PortalCourseRepository {
  abstract upsert(data: PortalCourseData): Promise<Upserted<PortalCourse>>;
  abstract findById(id: string): Promise<PortalCourse | null>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<PortalCourse | null>;
}
