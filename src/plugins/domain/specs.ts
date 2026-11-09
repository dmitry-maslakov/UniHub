import { extname } from 'node:path';
import { CronExpressionParser } from 'cron-parser';
import type { z } from 'zod';
import {
  AccountLink,
  InvalidValueError,
  MediaType,
  PluginName,
  PortalId,
} from '@app/kernel';

// What the plugins' decorators said, checked. Names and portals go into
// keys and job ids, so only what PluginName and PortalId allow.

const valid = <S extends z.ZodType>(
  schema: S,
  what: string,
  value: string,
): z.output<S> => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidValueError(what, value);
  return parsed.data;
};

// A poll's schedule as BullMQ reads it: a pattern, one its own parser
// (cron-parser) takes. Checked as plugins are found, so a bad one stops the
// app at start, in every role, instead of failing once the schedules are set.
const parses = (pattern: string) => {
  try {
    CronExpressionParser.parse(pattern);
    return true;
  } catch {
    return false;
  }
};

const schedule = (pattern: string) => {
  if (!pattern || !parses(pattern))
    throw new InvalidValueError('poll schedule', pattern);
  return pattern;
};

export interface PushSpec {
  portal: PortalId;
  // how users may link accounts of their own; shared needs no naming
  links: readonly AccountLink[];
  // the portal is a site per school, its records kept apart by site
  instances: boolean;
}

export interface PollSpec extends PushSpec {
  schedule: string;
  // the portal's directory of courses, sent whole: users pick from it
  catalog: boolean;
}

export interface AggregatorSpec<T extends string = string> {
  name: PluginName;
  topics: readonly T[];
}

export const pushSpec = (options: {
  portal: string;
  links?: readonly string[];
  instances?: boolean;
}): PushSpec => ({
  portal: valid(PortalId, 'connector portal', options.portal),
  links: [...new Set(options.links ?? [])].map((link) =>
    valid(AccountLink, 'connector link', link),
  ),
  instances: options.instances === true,
});

export const pollSpec = (options: {
  portal: string;
  schedule: string;
  links?: readonly string[];
  instances?: boolean;
  catalog?: boolean;
}): PollSpec => ({
  ...pushSpec(options),
  schedule: schedule(options.schedule),
  catalog: options.catalog === true,
});

export const aggregatorSpec = <T extends string>(options: {
  name: string;
  topics: readonly T[];
}): AggregatorSpec<T> => ({
  name: valid(PluginName, 'plugin name', options.name),
  topics: options.topics,
});

// an accepts entry as the processor wrote it, and as files are matched:
// '.PDF' as '.pdf', 'Application/PDF' as 'application/pdf'
interface Accepted {
  entry: string;
  as: string;
}

// A file's extension is what follows its last dot (labs.tar.gz's is .gz),
// so an extension of two (.tar.gz) would never match: refused.
const EXTENSION = /^\.[^.]+$/;

const accepted = (entry: string): Accepted => {
  if (entry.startsWith('.')) {
    if (!EXTENSION.test(entry))
      throw new InvalidValueError('accepts entry', entry);
    return { entry, as: entry.toLowerCase() };
  }
  const type = MediaType.safeParse(entry);
  // neither an extension nor a media type
  if (!type.success) throw new InvalidValueError('accepts entry', entry);
  return { entry, as: type.data };
};

const MINUTE = 60_000;

interface Heavy {
  timeoutMinutes: number;
}

const heavyLimit = (heavy: Heavy | undefined) => {
  if (!heavy) return null;
  if (!Number.isInteger(heavy.timeoutMinutes) || heavy.timeoutMinutes < 1)
    throw new InvalidValueError('heavy timeout', String(heavy.timeoutMinutes));
  return heavy.timeoutMinutes * MINUTE;
};

interface ContentOptions {
  name: string;
  version: number;
  accepts: readonly string[];
}

const parsed = (options: ContentOptions) =>
  [
    valid(PluginName, 'plugin name', options.name),
    options.version,
    options.accepts.map(accepted),
  ] as const;

// What a processor or an unpacker takes, and how a file is matched by it.
abstract class ContentSpec {
  protected constructor(
    readonly name: PluginName,
    readonly version: number,
    private readonly accepts: readonly Accepted[],
  ) {}

  // the entries as files are matched by them
  get takes() {
    return this.accepts.map(({ as }) => as);
  }

  // The entry this file matches, as the processor wrote it, null if none
  // does. The extension first: a portal's media type is only a hint, often
  // a vague one (application/octet-stream).
  match(file: { name: string; mime: MediaType | null }): string | null {
    const ext = extname(file.name).toLowerCase();
    const found =
      this.accepts.find((a) => a.as === ext) ??
      this.accepts.find((a) => a.as === file.mime);
    return found?.entry ?? null;
  }
}

export class ProcessorSpec extends ContentSpec {
  private constructor(
    name: PluginName,
    version: number,
    accepts: readonly Accepted[],
    // set for a heavy processor: how long a run of it may take
    readonly timeLimitMs: number | null,
  ) {
    super(name, version, accepts);
  }

  static of(options: ContentOptions & { heavy?: Heavy }) {
    const [name, version, accepts] = parsed(options);
    return new ProcessorSpec(name, version, accepts, heavyLimit(options.heavy));
  }

  // its jobs wait in the queue of their own, for a model to be started
  get heavy() {
    return this.timeLimitMs !== null;
  }
}

export class UnpackerSpec extends ContentSpec {
  static of(options: ContentOptions) {
    return new UnpackerSpec(...parsed(options));
  }
}
