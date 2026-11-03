import { Command } from '@nestjs/cqrs';
import type { Json } from '../../domain/changes.js';

// `course` is the portal's id of the course, not ours
export interface ItemInput {
  portal: string;
  externalId: string;
  course: string | null;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
}

export class UpsertItemCommand extends Command<{
  id: string;
  changed: boolean;
}> {
  constructor(public readonly data: ItemInput) {
    super();
  }
}
