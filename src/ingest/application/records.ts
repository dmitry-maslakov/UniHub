import { z } from 'zod';
import type { FileInput, ItemInput } from '../../catalog/contracts.js';

// Plugin records are checked here: in-process plugins can pass objects with
// extra fields, gRPC ones send whatever they like. Unknown keys are dropped,
// missing optional fields become null so comparing and writing agree.

const id = z.string().min(1);
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? null);

export const courseRecord = z.object({
  externalId: id,
  name: z.string().min(1),
  url: optional(z.string()),
  meta: optional(z.json()),
});

export const itemRecord = z.object({
  externalId: id,
  course: optional(id),
  kind: z.string().min(1),
  title: optional(z.string()),
  url: optional(z.string()),
  publishedAt: optional(z.coerce.date()),
  raw: z.json(),
});

export const fileRecord = z.object({
  externalId: id,
  course: optional(id),
  item: optional(id),
  name: z.string().min(1),
  path: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  url: optional(z.string()),
  size: optional(z.number().int().nonnegative()),
  mime: optional(z.string()),
  updatedAt: optional(z.coerce.date()),
});

export function toItemInput(portal: string, record: unknown): ItemInput {
  return { ...itemRecord.parse(record), portal };
}

export function toFileInput(portal: string, record: unknown): FileInput {
  const { updatedAt, ...file } = fileRecord.parse(record);
  return { ...file, sourceUpdatedAt: updatedAt, portal };
}
