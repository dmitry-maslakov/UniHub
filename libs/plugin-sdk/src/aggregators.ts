import type { Message, Topic } from './messages.js';

// Aggregators react to what came in and build their own data; the hub only
// hands them messages of their topics (see processors.ts on delivery).

export interface AggregatorOptions {
  name: string;
  topics: Topic[];
}

export interface HandlesMessages {
  handle(message: Message): Promise<void>;
}
