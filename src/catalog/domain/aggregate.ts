import { AggregateRoot } from '@nestjs/cqrs';
import type { CatalogEvent } from './events.js';

// What catalog's ingested records share: the events a change records (kept
// until the repository writes them to the outbox with the change itself),
// and whether there is a change to write at all. Not merged with Nest's
// EventPublisher: that one is app-wide and would publish on the EventBus.
export abstract class CatalogAggregate extends AggregateRoot<CatalogEvent> {
  private unsaved = false;

  get dirty() {
    return this.unsaved;
  }

  protected touch() {
    this.unsaved = true;
  }
}
