import { AggregateRoot } from '@nestjs/cqrs';
import { differs } from './changes.js';
import type { CatalogEvent } from './events.js';
import type { PortalRef } from './portal-ref.js';

// What every record a portal sends has: the hub's id for it, and the
// portal's. A record as the shared account sees it, its version under the
// record's id; other accounts' come with their views (README, Portal
// accounts).
export interface Ingested {
  id: string;
  ref: PortalRef;
}

// What catalog's ingested records share: their state as the repository
// saves and restores it, the events a change records (kept until the
// repository writes them to the outbox with the change itself), and whether
// there is a change to write at all. Not merged with Nest's EventPublisher:
// that one is app-wide and would publish on the EventBus.
export abstract class CatalogAggregate<
  S extends Ingested,
> extends AggregateRoot<CatalogEvent> {
  private unsaved = false;

  // each record has create() for a new one, restore() for a saved one
  protected constructor(protected readonly state: S) {
    super();
  }

  get id() {
    return this.state.id;
  }

  get ref() {
    return this.state.ref;
  }

  get snapshot(): Readonly<S> {
    return { ...this.state };
  }

  get dirty() {
    return this.unsaved;
  }

  protected touch() {
    this.unsaved = true;
  }
}

export interface Removable extends Ingested {
  // the portal said it's gone: the account's sight of it is hidden since;
  // sending it again clears this
  removedAt: Date | null;
}

// A record the portal can say is gone (a portal course stays). It goes once,
// however often the portal says so, and comes back when the portal sends it
// again, changed or not.
export abstract class RemovableAggregate<
  S extends Removable,
> extends CatalogAggregate<S> {
  protected get wasRemoved() {
    return this.state.removedAt !== null;
  }

  // false if it was removed already: one removal, one event
  protected markRemoved(at: Date, event: CatalogEvent) {
    if (this.wasRemoved) return false;
    this.state.removedAt = at;
    this.touch();
    this.apply(event);
    return true;
  }

  // false when the portal sent what we already have, unless it was removed
  protected resync<T extends object>(now: T, next: Partial<T>) {
    if (!this.wasRemoved && !differs(now, next)) return false;
    this.state.removedAt = null;
    this.touch();
    return true;
  }
}
