import { randomUUID } from 'node:crypto';
import type { Json } from '@app/kernel';
import { CatalogAggregate, type Ingested } from '../aggregate.js';
import { differs } from '../changes.js';
import type { PortalRef } from '../portal-ref.js';

// what the portal says about one of its courses
export interface PortalCourseProps {
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface PortalCourseState extends Ingested {
  props: PortalCourseProps;
}

// A course as it exists in one portal (a Canvas course, a Moodle course, a
// Teams team). Nothing downstream reads them, so a change records no event.
export class PortalCourse extends CatalogAggregate<PortalCourseState> {
  static create(ref: PortalRef, props: PortalCourseProps) {
    const course = new PortalCourse({
      id: randomUUID(),
      ref,
      props,
    });
    course.touch();
    return course;
  }

  static restore(state: PortalCourseState) {
    return new PortalCourse(state);
  }

  // false when the portal sent what we already have
  sync(props: PortalCourseProps) {
    if (!differs(this.state.props, props)) return false;
    this.state.props = props;
    this.touch();
    return true;
  }
}
