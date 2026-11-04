import type { INestApplication } from '@nestjs/common';
import {
  OutboxEvents,
  type OutboxEvent,
  type OutboxMessage,
  type OutboxPublishedEvent,
} from '@nestjs/outbox';
import { filter, firstValueFrom, map } from 'rxjs';

// The next message the relay publishes that `matches`: asked for before
// whatever sends it, since an event that came earlier is gone.
export const published = (
  app: INestApplication,
  matches: (message: OutboxMessage) => boolean,
) =>
  firstValueFrom(
    app.get(OutboxEvents).events$.pipe(
      filter(
        (event: OutboxEvent): event is OutboxPublishedEvent =>
          event.type === 'published' && matches(event.message),
      ),
      map(({ message }) => message),
    ),
  );
