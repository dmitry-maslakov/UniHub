import type {
  ContentHash,
  Json,
  MediaType,
  PluginName,
  PortalId,
} from '@app/kernel';
import type {
  CourseDto,
  CourseRef,
  FileDto,
  ItemDto,
  VisibleContentDto,
  VisibleItemDto,
} from '../../catalog/contracts.js';
import type {
  ContainedMember,
  RecordMatch,
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

// A file whose text or name matched, or a member of an archive the file is
// by its text or its path, its best pages first
export interface FileResultView {
  type: 'file' | 'member';
  fileId: string;
  name: string;
  path: string;
  // the member's path in the file, null for the file itself
  member: string | null;
  // the course's slug
  course: string;
  pages: SearchPageView[];
  // the file's name, or the member's path, where the words matched; null
  // when only the text did
  matchedName: Snippet | null;
  // the other files the user reads that hold the same content, themselves:
  // not those that hold it as a member
  sameContentIn: string[];
}

// a post whose text matched, by its best fragment
export interface PostResultView {
  type: 'post';
  itemId: string;
  kind: string;
  title: string | null;
  url: string | null;
  publishedAt: Date | null;
  // the course's slug
  course: string;
  snippet: Snippet;
}

export type SearchResultView = FileResultView | PostResultView;

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

// What a user may find: the contents' places (placesOf), the files and the
// posts the courses they read show, and those courses
export interface Findable {
  places: ReadonlyMap<ContentHash, Place[]>;
  files: readonly VisibleContentDto[];
  posts: readonly VisibleItemDto[];
  courses: readonly CourseRef[];
}

// What search found, in its order: of a content, the file or member whose
// name matched (one holding it still, in a course the user reads), else the
// first of its places by its text, with its pages and the other files
// holding it themselves; of a post's hash, the post, if the user reads it
export function searchResults(
  hits: readonly TextHit[],
  { places, files, posts, courses }: Findable,
): SearchResultView[] {
  const slugs = new Map(courses.map(({ id, slug }) => [id, slug]));
  const holding = Map.groupBy<string, VisibleContentDto>(
    files,
    ({ hash }) => hash,
  );
  const postsById = new Map(posts.map((post) => [post.itemId, post]));
  // the place a name names: the file, if it holds the content found, or the
  // member at that path in the first file holding the archive
  const named = (
    hash: ContentHash,
    { kind, record, member }: RecordMatch,
  ): Place | undefined => {
    if (kind === 'file')
      return places
        .get(hash)
        ?.find((place) => place.fileId === record && place.member === null);
    const archive = kind === 'tree' ? holding.get(record)?.[0] : undefined;
    return archive && { ...archive, hash, member };
  };
  return hits.flatMap(({ hash, pages, records }) => {
    const name = records
      .map((match) => ({ match, place: named(hash, match) }))
      .find(({ place }) => place);
    const place = name?.place ?? (pages.length ? places.get(hash)?.[0] : null);
    const found: SearchResultView[] = place
      ? [
          {
            type: place.member === null ? 'file' : 'member',
            fileId: place.fileId,
            name: place.name,
            path: place.path,
            member: place.member,
            course: slugs.get(place.courseId)!,
            pages: pages.map(({ page, processor, snippet }) => ({
              page,
              processor,
              snippet,
            })),
            matchedName: name?.match.snippet ?? null,
            sameContentIn: (places.get(hash) ?? [])
              .filter(
                ({ fileId, member }) =>
                  member === null && fileId !== place.fileId,
              )
              .map(({ fileId }) => fileId),
          },
        ]
      : [];
    for (const { kind, record, snippet } of records) {
      const post = postsById.get(record);
      if (kind !== 'post' || !post) continue;
      const { courseId, ...view } = post;
      found.push({
        type: 'post',
        ...view,
        course: slugs.get(courseId)!,
        snippet,
      });
    }
    return found;
  });
}
