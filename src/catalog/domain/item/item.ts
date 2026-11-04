import { randomUUID } from 'node:crypto';
import type { Json } from '@app/kernel';
import { RemovableAggregate, type Removable } from '../aggregate.js';
import { ITEM_CHANGED, ITEM_REMOVED } from '../events.js';
import type { PortalRef } from '../portal-ref.js';

// what the portal says about something it published
export interface ItemProps {
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  // whatever the portal returned, kept as is
  raw: Json;
}

export interface ItemState extends Removable {
  props: ItemProps;
  portalCourseId: string | null;
}

// Anything a portal publishes that isn't a file: posts, announcements,
// pages. Every real change, its first sync included, is news to plugins.
export class Item extends RemovableAggregate<ItemState> {
  static create(
    ref: PortalRef,
    props: ItemProps,
    portalCourseId: string | null,
  ) {
    const item = new Item({
      id: randomUUID(),
      ref,
      props,
      portalCourseId,
      removedAt: null,
    });
    item.recordChange();
    return item;
  }

  static restore(state: ItemState) {
    return new Item(state);
  }

  get portalCourseId() {
    return this.state.portalCourseId;
  }

  // false when the portal sent what we already have
  sync(props: ItemProps, portalCourseId: string | null) {
    const s = this.state;
    const now = { ...s.props, portalCourseId: s.portalCourseId };
    if (!this.resync(now, { ...props, portalCourseId })) return false;
    s.props = props;
    s.portalCourseId = portalCourseId;
    this.recordChange();
    return true;
  }

  // false if it was removed already
  remove(at = new Date()) {
    return this.markRemoved(at, {
      topic: ITEM_REMOVED,
      payload: { portal: this.ref.portal, itemId: this.id },
    });
  }

  private recordChange() {
    this.touch();
    this.apply({
      topic: ITEM_CHANGED,
      payload: { portal: this.ref.portal, itemId: this.id },
    });
  }
}
