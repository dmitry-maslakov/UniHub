import type {
  ContentHash,
  Json,
  MediaType,
  PluginName,
  PortalId,
} from '@app/kernel';
import type {
  CourseDto,
  FileDto,
  ItemDto,
  VisibleContentDto,
} from '../../catalog/contracts.js';
import type {
  ContainedMember,
  Snippet,
  TextHit,
  TextInfo,
} from '../../processing/contracts.js';

// What a user reads, through REST and MCP alike: catalog's records without
// what only the hub needs (portal ids, removal, content hashes).

export interface PortalCourseView {
  portal: PortalId;
  name: string;
  year: number | null;
}

export interface CourseView {
  slug: string;
  name: string;
  portalCourses: PortalCourseView[];
}

export interface ItemView {
  id: string;
  portal: PortalId;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  raw: Json;
}

export interface FileView {
  id: string;
  portal: PortalId;
  // the post it came with, if any
  itemId: string | null;
  name: string;
  path: string;
  url: string | null;
  size: number | null;
  mime: MediaType | null;
  hasContent: boolean;
}

// the file and what processors made of it, without the text
export interface FileDetailsView extends FileView {
  texts: TextInfo[];
}

// a page of a file that matched, by its best fragment
export interface SearchPageView {
  page: number;
  processor: PluginName;
  snippet: Snippet;
}

// a file whose text matched, or a member of it, its best pages first
export interface SearchResultView {
  fileId: string;
  name: string;
  path: string;
  // the member's path in the file, null for the file itself
  member: string | null;
  // the course's slug
  course: string;
  pages: SearchPageView[];
  // the other files the user reads that hold the same content, themselves:
  // not those that hold it as a member
  sameContentIn: string[];
}

export interface SearchView {
  results: SearchResultView[];
}

export const courseView = ({
  slug,
  name,
  portalCourses,
}: CourseDto): CourseView => ({
  slug,
  name,
  portalCourses: portalCourses.map(({ portal, name, year }) => ({
    portal,
    name,
    year,
  })),
});

export const itemView = ({
  id,
  portal,
  kind,
  title,
  url,
  publishedAt,
  raw,
}: ItemDto): ItemView => ({ id, portal, kind, title, url, publishedAt, raw });

export const fileView = ({
  id,
  portal,
  itemId,
  name,
  path,
  url,
  size,
  mime,
  contentHash,
}: FileDto): FileView => ({
  id,
  portal,
  itemId,
  name,
  path,
  url,
  size,
  mime,
  hasContent: contentHash !== null,
});

// a file that holds a content, or holds it as a member
export interface Place extends VisibleContentDto {
  member: string | null;
}

// Where a user finds each content: the files that hold it, then the members
// that do in the files holding their containers, each in catalog's order
// (by folder and name) and a file's members in their tree's
export function placesOf(
  files: readonly VisibleContentDto[],
  contained: readonly ContainedMember[],
) {
  const inside = Map.groupBy(contained, ({ container }) => container);
  const members = files.flatMap((file) =>
    (inside.get(file.hash) ?? []).map(({ path, hash }) => ({
      ...file,
      hash,
      member: path,
    })),
  );
  return Map.groupBy<ContentHash, Place>(
    [...files.map((file) => ({ ...file, member: null })), ...members],
    ({ hash }) => hash,
  );
}

// what search found of a content, as the first of its places, the other
// files holding it themselves named with it
export const searchResultView = (
  { pages }: TextHit,
  [{ fileId, name, path, member, courseId }, ...others]: Place[],
  slugs: ReadonlyMap<string, string>,
): SearchResultView => ({
  fileId,
  name,
  path,
  member,
  course: slugs.get(courseId)!,
  pages: pages.map(({ page, processor, snippet }) => ({
    page,
    processor,
    snippet,
  })),
  sameContentIn: others
    .filter(({ member }) => member === null)
    .map(({ fileId }) => fileId),
});
