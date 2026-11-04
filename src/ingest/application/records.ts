import { z } from 'zod';
import { MediaType, StoredJson, StoredText, type PortalId } from '@app/kernel';
import type { FileInput, ItemInput } from '../../catalog/contracts.js';

// Plugin records are checked here: in-process plugins can pass objects with
// extra fields, gRPC ones send whatever they like. Unknown keys are dropped,
// missing optional fields become null, and text and json are taken in the
// form postgres keeps them, so comparing and writing agree.
const id = StoredText.min(1);
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? null);

export const courseRecord = z.object({
  externalId: id,
  name: StoredText.min(1),
  url: optional(StoredText),
  meta: optional(StoredJson),
});

export const itemRecord = z.object({
  externalId: id,
  course: optional(id),
  kind: StoredText.min(1),
  title: optional(StoredText),
  url: optional(StoredText),
  publishedAt: optional(z.coerce.date()),
  raw: StoredJson,
});

export const fileRecord = z.object({
  externalId: id,
  course: optional(id),
  item: optional(id),
  name: StoredText.min(1),
  path: StoredText.nullish().transform((v) => v ?? ''),
  url: optional(StoredText),
  // -0 passes as nonnegative, and the bigint column keeps 0
  size: optional(
    z
      .number()
      .int()
      .nonnegative()
      .overwrite((n) => (n === 0 ? 0 : n)),
  ),
  // a portal's type is a hint: its essence, or unknown if it is none
  mime: optional(StoredText).transform(
    (v) => MediaType.safeParse(v).data ?? null,
  ),
  updatedAt: optional(z.coerce.date()),
});

export const removal = z.object({
  kind: z.enum(['item', 'file']),
  externalId: id,
});

export const syncState = StoredJson;

export function toItemInput(portal: PortalId, record: unknown): ItemInput {
  return { ...itemRecord.parse(record), portal };
}

export function toFileInput(portal: PortalId, record: unknown): FileInput {
  const { updatedAt, ...file } = fileRecord.parse(record);
  return { ...file, sourceUpdatedAt: updatedAt, portal };
}
