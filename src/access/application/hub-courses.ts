import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { LinkMode, PortalId } from '@app/kernel';
import {
  CountCourseReadersQuery,
  ListCourseReadersQuery,
  type CourseReaderDto,
} from '../../identity/contracts.js';
import { nameHas, PortalLinksQuery } from '../../accounts/contracts.js';
import {
  FindCourseQuery,
  ListHubCoursesQuery,
  ListSharedPortalCoursesQuery,
  UnknownCourseError,
  type CourseRef,
} from '../../catalog/contracts.js';
import type { Page } from './page.js';

export interface HubLinkView {
  portal: PortalId;
  label: string;
  mode: LinkMode;
  // the school's site, for a portal that is a site per school
  instance: string | null;
  externalId: string;
  year: number | null;
  // none for a portal read with users' own accounts: what they hold is
  // theirs
  name: string | null;
}

export interface HubCourseView extends CourseRef {
  readers: number;
  links: HubLinkView[];
}

export interface LinkablePortalCourseView {
  portal: PortalId;
  label: string;
  mode: 'shared' | 'public';
  externalId: string;
  name: string;
  course: CourseRef | null;
}

export interface LinkableView {
  total: number;
  portalCourses: LinkablePortalCourseView[];
}

const byName = new Intl.Collator('und', { numeric: true });

// a portal's mode and label; shared, and its id, for one nothing answered
type Links = ReadonlyMap<PortalId, { mode: LinkMode; label: string }>;
const linksOf = (links: Links, portal: PortalId) =>
  links.get(portal) ?? { mode: 'shared' as const, label: portal };

// What admins see of the courses they made, and of the portal courses to
// link to them: read from catalog, accounts (how each portal is read, and
// its label) and identity (who is granted what). An admin learns nothing of
// what users' own accounts hold: a link of a portal read with them shows
// by its id alone.
@Injectable()
export class HubCourses {
  constructor(private readonly queries: QueryBus) {}

  async list(): Promise<HubCourseView[]> {
    const courses = await this.queries.execute(new ListHubCoursesQuery());
    const portals = [
      ...new Set(courses.flatMap(({ links }) => links.map((l) => l.portal))),
    ];
    const [modes, readers] = await Promise.all([
      this.queries.execute(new PortalLinksQuery(portals)),
      this.queries.execute(
        new CountCourseReadersQuery(courses.map(({ id }) => id)),
      ),
    ]);
    return courses
      .map(({ links, ...course }) => ({
        ...course,
        readers: readers.get(course.id) ?? 0,
        links: links.map(({ instance, name, ...link }) => {
          const { mode, label } = linksOf(modes, link.portal);
          return {
            ...link,
            label,
            mode,
            instance: instance || null,
            name: mode === 'token' ? null : name,
          };
        }),
      }))
      .sort(
        (a, b) =>
          byName.compare(a.name, b.name) || byName.compare(a.slug, b.slug),
      );
  }

  // UnknownCourseError for an id no course has
  async readers(courseId: string): Promise<CourseReaderDto[]> {
    const course = await this.queries.execute(
      new FindCourseQuery({ id: courseId }),
    );
    if (!course) throw new UnknownCourseError(courseId);
    return this.queries.execute(new ListCourseReadersQuery(courseId));
  }

  // the portal courses of the shared and public portals whose names have
  // `q`, by name: those an admin can link, as the shared account reads them
  async linkable({
    q,
    offset,
    limit,
  }: Page & { q?: string }): Promise<LinkableView> {
    const all = await this.queries.execute(new ListSharedPortalCoursesQuery());
    const modes = await this.queries.execute(
      new PortalLinksQuery([...new Set(all.map(({ portal }) => portal))]),
    );
    const found = all
      .flatMap(({ portal, externalId, name, course }) => {
        const { mode, label } = linksOf(modes, portal);
        return mode === 'token' || (q && !nameHas(name, q))
          ? []
          : [{ portal, label, mode, externalId, name, course }];
      })
      .sort(
        (a, b) =>
          byName.compare(a.name, b.name) ||
          byName.compare(a.label, b.label) ||
          byName.compare(a.externalId, b.externalId),
      );
    return {
      total: found.length,
      portalCourses: found.slice(offset, offset + limit),
    };
  }
}
