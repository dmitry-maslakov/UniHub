import { z } from 'zod';
import type { FileInput, ItemInput } from '../../catalog/contracts.js';

// Plugin records are checked here: in-process plugins can pass objects with
// extra fields, gRPC ones send whatever they like. Unknown keys are dropped,
// missing optional fields become null so comparing and writing agree.

// postgres can't store \u0000 in text or jsonb
const text = z.string().refine((v) => !v.includes('\u0000'), {
  message: 'contains a NUL character',
});
const json = z.json().refine((v) => !JSON.stringify(v).includes('\\u0000'), {
  message: 'contains a NUL character',
});
const id = text.min(1);
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? null);

export const courseRecord = z.object({
  externalId: id,
  name: text.min(1),
  url: optional(text),
  meta: optional(json),
});

export const itemRecord = z.object({
  externalId: id,
  course: optional(id),
  kind: text.min(1),
  title: optional(text),
  url: optional(text),
  publishedAt: optional(z.coerce.date()),
  raw: json,
});

export const fileRecord = z.object({
  externalId: id,
  course: optional(id),
  item: optional(id),
  name: text.min(1),
  path: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
  url: optional(text),
  size: optional(z.number().int().nonnegative()),
  mime: optional(text),
  updatedAt: optional(z.coerce.date()),
});

export const removal = z.object({
  kind: z.enum(['item', 'file']),
  externalId: id,
});

export const syncState = json;

export function toItemInput(portal: string, record: unknown): ItemInput {
  return { ...itemRecord.parse(record), portal };
}

export function toFileInput(portal: string, record: unknown): FileInput {
  const { updatedAt, ...file } = fileRecord.parse(record);
  return { ...file, sourceUpdatedAt: updatedAt, portal };
}
