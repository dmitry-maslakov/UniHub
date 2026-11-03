import type { Json, Upserted } from './changes.js';

// a course as it exists in one portal
export interface PortalCourse {
  id: string;
  portal: string;
  externalId: string;
  name: string;
  url: string | null;
  meta: Json | null;
}

export type PortalCourseData = Omit<PortalCourse, 'id' | 'url' | 'meta'> &
  Partial<Pick<PortalCourse, 'url' | 'meta'>>;

export abstract class PortalCourseRepository {
  abstract upsert(data: PortalCourseData): Promise<Upserted<PortalCourse>>;
  abstract findByExternalId(
    portal: string,
    externalId: string,
  ): Promise<PortalCourse | null>;
}
