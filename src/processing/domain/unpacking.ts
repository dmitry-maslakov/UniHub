import type { ContentHash, MediaType, PluginName } from '@app/kernel';

// What an unpacker listed of a container content (an archive): one tree per
// content, every member flattened, a nested container's under its path
// (team1/lab.tar.gz/src/main.c). Made again for another unpacker version or
// policy, the hub's limits it was made under.

export interface UnpackingKey {
  hash: ContentHash;
  unpacker: PluginName;
  version: number;
}

// why a member was listed but not kept, or a container in it not opened
export const LEFT_OUT = [
  'TOO_LARGE',
  'OVER_BUDGET',
  'DUPLICATE_PATH',
  'TOO_DEEP',
] as const;
export type LeftOut = (typeof LEFT_OUT)[number];

export interface Member {
  path: string;
  // null: listed, not kept
  hash: ContentHash | null;
  size: number | null;
  mime: MediaType | null;
  leftOut: LeftOut | null;
}

// what a tree was made by
export interface Made extends UnpackingKey {
  policy: number;
}

export interface Unpacking extends Made {
  members: Member[];
  // why it couldn't be read to its end; what was read stays
  cutShort: string | null;
}

// A size as a container declares it, a whole number of bytes or none: the
// container's bytes are anyone's
export const declaredSize = (size: number | undefined) =>
  size !== undefined && Number.isSafeInteger(size) && size >= 0 ? size : null;

const MAX_REASON = 500;

// Why a walk was cut short at `where`, from an error that a container's
// bytes may have worded: one line, as long as a reader needs
export const cutShortBy = (where: string, err: unknown) =>
  `${where}: ${err instanceof Error ? err.message : String(err)}`
    .replace(/\p{Cc}+/gu, ' ')
    .slice(0, MAX_REASON);

// a member kept, with its content
export const kept = (members: readonly Member[]) =>
  members.filter(
    (member): member is Member & { hash: ContentHash } => member.hash !== null,
  );

// made by this unpacker's version under these limits
export const isCurrent = (
  tree: Unpacking,
  { unpacker, version }: UnpackingKey,
  policy: number,
) =>
  tree.unpacker === unpacker &&
  tree.version === version &&
  tree.policy === policy;

export abstract class UnpackingRepository {
  // the content's tree, null if it has none
  abstract current(hash: ContentHash): Promise<Unpacking | null>;
  // replaces the content's tree, in one transaction
  abstract save(unpacking: Unpacking): Promise<void>;
  // what every tree there is was made by, without its members
  abstract trees(): AsyncIterable<Made>;
  // the members, of any content's tree, that hold this content
  abstract holding(
    hash: ContentHash,
  ): Promise<
    { container: ContentHash; path: string; mime: MediaType | null }[]
  >;
}
