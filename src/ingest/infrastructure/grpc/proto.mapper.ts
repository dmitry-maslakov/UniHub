import type { Json } from '@app/kernel';
import { MalformedRecordError } from '../../domain/errors.js';
import type { Timestamp__Output } from './generated/google/protobuf/Timestamp.js';
import type { CourseRecord__Output } from './generated/unihub/ingest/v1/CourseRecord.js';
import type { FileRecord__Output } from './generated/unihub/ingest/v1/FileRecord.js';
import type { ItemRecord__Output } from './generated/unihub/ingest/v1/ItemRecord.js';
import type {
  State,
  State__Output,
} from './generated/unihub/ingest/v1/State.js';

// The messages as the records IngestService takes, and back. Proto carries
// json as text and times as Timestamps; every other field has the record's
// own name, and IngestService checks them all.

const json = (field: string, text: string | undefined) => {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as Json;
  } catch {
    throw new MalformedRecordError([`${field}: not valid json`]);
  }
};

// a Timestamp leaves out what is 0, as proto3 does with every number
const date = (t: Timestamp__Output | undefined) =>
  t && new Date((t.seconds ?? 0) * 1000 + (t.nanos ?? 0) / 1e6);

export const courseOf = ({ metaJson, ...course }: CourseRecord__Output) => ({
  ...course,
  meta: json('metaJson', metaJson),
});

export const itemOf = ({
  rawJson,
  publishedAt,
  ...item
}: ItemRecord__Output) => ({
  ...item,
  publishedAt: date(publishedAt),
  raw: json('rawJson', rawJson),
});

export const fileOf = ({ updatedAt, ...file }: FileRecord__Output) => ({
  ...file,
  updatedAt: date(updatedAt),
});

// "null" saves null; a missing field is more likely a mistake
export function stateOf({ json: text }: State__Output) {
  if (text === undefined) throw new MalformedRecordError(['json is required']);
  return json('json', text);
}

// no json when the connector never saved a state
export const toStateMessage = (state: Json | null): State =>
  state === null ? {} : { json: JSON.stringify(state) };
