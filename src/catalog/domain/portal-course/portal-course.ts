import { randomUUID } from 'node:crypto';
import type { Json } from '@app/kernel';
import { CatalogAggregate } from '../aggregate.js';
import { differs } from '../changes.js';
import type { PortalRef } from '../portal-ref.js';

// what the portal says about one of its courses
export interface PortalCourseProps {
  name: string;
  url: string | null;
  meta: Json | null;
}

export interface PortalCourseState {
  id: string;
  ref: PortalRef;
  props: PortalCourseProps;
}

// A course as it exists in one portal (a Canvas course, an ACS group, a
// Teams team). Nothing downstream reads them, so a change records no event.
export class PortalCourse extends CatalogAggregate {
  private constructor(private readonly state: PortalCourseState) {
    super();
  }

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

  get id() {
    return this.state.id;
  }

  get ref() {
    return this.state.ref;
  }

  get snapshot(): Readonly<PortalCourseState> {
    return { ...this.state };
  }

  // false when the portal sent what we already have
  sync(props: PortalCourseProps) {
    if (!differs(this.state.props, props)) return false;
    this.state.props = props;
    this.touch();
    return true;
  }
}
