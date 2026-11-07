import { z } from 'zod';
import { MediaType, StoredJson, StoredText } from '@app/kernel';
import type { CourseRecord, FileRecord, ItemRecord } from '@app/plugin-sdk';
import type {
  FileInput,
  ItemInput,
  PortalCourseInput,
  PortalRef,
} from '../../catalog/contracts.js';
import type { Connection } from '../domain/connection.js';
import { MalformedRecordError } from '../domain/errors.js';

// Records are checked here: in-process plugins can pass objects with extra
// fields, gRPC ones send whatever they like. Unknown keys are dropped,
// missing optional fields become null, and text and json are taken in the
// form postgres keeps them, so comparing and writing agree.

// every key of the sdk's record and no other, so a field the sdk gains
// can't be dropped here unnoticed
type Shape<T> = { [K in keyof Required<T>]: z.ZodType };

const externalId = StoredText.min(1);
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((v) => v ?? null);

const courseRecord = z.object({
  externalId,
  name: StoredText.min(1),
  url: optional(StoredText),
  meta: optional(StoredJson),
} satisfies Shape<CourseRecord>);

const itemRecord = z.object({
  externalId,
  course: optional(externalId),
  kind: StoredText.min(1),
  title: optional(StoredText),
  url: optional(StoredText),
  publishedAt: optional(z.coerce.date()),
  raw: StoredJson,
} satisfies Shape<ItemRecord>);

const fileRecord = z.object({
  externalId,
  course: optional(externalId),
  item: optional(externalId),
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
} satisfies Shape<FileRecord>);

// what doesn't fit is the sender's to fix, named field by field; an issue
// with the value as a whole (an id, the state) has no path, so `what` names it
function parse<T extends z.ZodType>(schema: T, raw: unknown, what: string) {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  throw new MalformedRecordError(
    result.error.issues.map(
      (i) => `${i.path.length ? i.path.join('.') : what}: ${i.message}`,
    ),
  );
}

// A record of this connection's portal, by the portal's id, of the site
// the connection reads: the one place a record gets its portal and site,
// which no plugin sends
export const toRef = (
  { portal, instance }: Connection,
  id: unknown,
): PortalRef => ({
  portal,
  instance,
  externalId: parse(externalId, id, 'externalId'),
});

export function toPortalCourseInput(
  connection: Connection,
  raw: unknown,
): PortalCourseInput {
  const course = parse(courseRecord, raw, 'course');
  return { ...course, ...toRef(connection, course.externalId) };
}

export function toItemInput(connection: Connection, raw: unknown): ItemInput {
  const item = parse(itemRecord, raw, 'item');
  return { ...item, ...toRef(connection, item.externalId) };
}

export function toFileInput(connection: Connection, raw: unknown): FileInput {
  const { updatedAt, ...file } = parse(fileRecord, raw, 'file');
  return {
    ...file,
    sourceUpdatedAt: updatedAt,
    ...toRef(connection, file.externalId),
  };
}

// whatever json the connector wants back on its next run
export const toState = (raw: unknown) => parse(StoredJson, raw, 'state');
