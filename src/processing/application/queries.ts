import { Query } from '@nestjs/cqrs';
import type { ContentHash, Json, MediaType, PluginName } from '@app/kernel';
import type { RecordKind } from '../domain/records.js';
import type { LeftOut } from '../domain/unpacking.js';

// What other modules read of processing: the texts straight from the
// database (infrastructure/read), and a search over them in the index
// (SearchTexts).

export interface TextInfo {
  processor: PluginName;
  version: number;
  pages: number;
}

export interface TextPage extends TextInfo {
  page: number;
  text: string;
}

// what the processors on made of some content: the newest version of each,
// with its number of pages (slides, sections), without the text
export class ListTextsQuery extends Query<TextInfo[]> {
  constructor(public readonly hash: ContentHash) {
    super();
  }
}

// one page (from 1) of the newest text made of some content, by the
// processor named or else the first one on. null if there's no such page,
// or its processor is off
export class GetTextPageQuery extends Query<TextPage | null> {
  constructor(
    public readonly hash: ContentHash,
    public readonly page: number,
    public readonly processor?: PluginName,
  ) {
    super();
  }
}

// A member of a container's tree, kept with what processors made of it, or
// listed with why it wasn't
export interface MemberInfo {
  // a nested container's members under its path
  path: string;
  size: number | null;
  mime: MediaType | null;
  leftOut: LeftOut | null;
  texts: TextInfo[];
}

// a page of the tree of some content, in the order its container lists
// them; none if it has no tree
export class ListMembersQuery extends Query<MemberInfo[]> {
  constructor(
    public readonly hash: ContentHash,
    public readonly offset: number,
    public readonly limit: number,
  ) {
    super();
  }
}

export interface MemberContent {
  hash: ContentHash;
  mime: MediaType | null;
}

// the content of the member kept at `path` in the tree of some content,
// null if none is
export class FindMemberQuery extends Query<MemberContent | null> {
  constructor(
    public readonly hash: ContentHash,
    public readonly path: string,
  ) {
    super();
  }
}

// a member kept in the tree of a container content, that processors made
// a text of
export interface ContainedMember {
  container: ContentHash;
  path: string;
  hash: ContentHash;
}

// the members with a text in the trees of these contents, each tree in its
// order: what a search looks through besides the contents themselves
export class ListContainedQuery extends Query<ContainedMember[]> {
  constructor(public readonly hashes: readonly ContentHash[]) {
    super();
  }
}

// A fragment of a chunk's text and where in it the query's words are:
// UTF-16 offsets into `text` (the chunk as indexed, NFC), each [start, end).
// Plain text: whatever HTML the source had comes as it was.
export interface Snippet {
  text: string;
  highlights: [start: number, end: number][];
}

// a post, a file or a tree whose record matched, by its best chunk there
export interface RecordMatch {
  kind: RecordKind;
  // the post's or the file's id, or the archive's content hash
  record: string;
  // a tree's: the path of the member that holds the content
  member: string | null;
  snippet: Snippet;
}

export interface TextHit {
  hash: ContentHash;
  // of its texts, best first, each page once, by its best chunk (at most 3)
  pages: {
    processor: PluginName;
    version: number;
    page: number;
    snippet: Snippet;
  }[];
  // what else matched, best first, each once: the names of files holding
  // it, the paths of members holding it, the posts it is the text of
  records: RecordMatch[];
}

// What a search may look through, as much as its caller may read: the
// index knows nothing of who reads what
export interface SearchScope {
  // the contents whose texts are looked through, files' and members'
  contents: readonly ContentHash[];
  // the posts looked through by their texts
  posts: readonly string[];
  // the files looked through by their names
  files: readonly string[];
  // the archives (their contents) whose members are looked through by
  // their paths
  archives: readonly ContentHash[];
}

// The contents whose newest texts of the processors on match, or the names
// of files or members holding them, and the posts whose texts match, best
// first, at most `limit` hits, a content or a post's text each. With an
// embedder, the texts and posts nearest the query's meaning too: knn always
// has nearest ones, so then there are up to `limit` even when none has the
// words. Names are found by their words alone.
export class SearchTextsQuery extends Query<TextHit[]> {
  constructor(
    public readonly text: string,
    public readonly among: SearchScope,
    public readonly limit: number,
  ) {
    super();
  }
}

// a post's text as the hub reads it, from what the portal sent of it: every
// string of `raw` but links and dates, HTML read as plain text
export class GetPostTextQuery extends Query<string> {
  constructor(public readonly raw: Json) {
    super();
  }
}
