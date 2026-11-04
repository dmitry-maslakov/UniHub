import type { Message, Topic } from './messages.js';

// Aggregators react to what came in and build their own data; the hub only
// hands them messages of their topics (see processors.ts on delivery).

export interface AggregatorOptions<T extends Topic = Topic> {
  name: string;
  topics: readonly T[];
}

export interface HandlesMessages<T extends Topic = Topic> {
  // a property, not a method: TypeScript checks methods' parameters both
  // ways, and would let a class that handles fewer topics than it listens to
  // pass for one that handles them all
  handle: (message: Message<T>) => Promise<void>;
}
