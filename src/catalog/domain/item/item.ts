import { randomUUID } from 'node:crypto';
import type { Json } from '@app/kernel';
import { CatalogAggregate } from '../aggregate.js';
import { differs, kept } from '../changes.js';
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

export interface ItemState {
  id: string;
  ref: PortalRef;
  props: ItemProps;
  portalCourseId: string | null;
  // the portal said it's gone; sending it again clears this
  removedAt: Date | null;
}

// Anything a portal publishes that isn't a file: posts, announcements,
// pages. Every real change, its first sync included, is news to plugins.
export class Item extends CatalogAggregate {
  private constructor(private readonly state: ItemState) {
    super();
  }

  static create(
    ref: PortalRef,
    props: ItemProps,
    portalCourseId: string | null,
  ) {
    const item = new Item({
      id: randomUUID(),
      ref,
      props: kept(props),
      portalCourseId,
      removedAt: null,
    });
    item.recordChange();
    return item;
  }

  static restore(state: ItemState) {
    return new Item(state);
  }

  get id() {
    return this.state.id;
  }

  get ref() {
    return this.state.ref;
  }

  get portalCourseId() {
    return this.state.portalCourseId;
  }

  get snapshot(): Readonly<ItemState> {
    return { ...this.state };
  }

  // false when the portal sent what we already have; a removed item it
  // sends again is back
  sync(props: ItemProps, portalCourseId: string | null) {
    const next = kept(props);
    const s = this.state;
    const now = { ...s.props, portalCourseId: s.portalCourseId };
    if (s.removedAt === null && !differs(now, { ...next, portalCourseId }))
      return false;
    s.props = next;
    s.portalCourseId = portalCourseId;
    s.removedAt = null;
    this.recordChange();
    return true;
  }

  // false if it was removed already: one removal, one event
  remove(at = new Date()) {
    if (this.state.removedAt) return false;
    this.state.removedAt = at;
    this.touch();
    this.apply({
      topic: ITEM_REMOVED,
      payload: { portal: this.ref.portal, itemId: this.id },
    });
    return true;
  }

  private recordChange() {
    this.touch();
    this.apply({
      topic: ITEM_CHANGED,
      payload: { portal: this.ref.portal, itemId: this.id },
    });
  }
}
