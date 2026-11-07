import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import type {
  Json,
  LinkMode,
  MediaType,
  PluginName,
  PortalId,
} from '@app/kernel';
import type { CourseReaderDto } from '../../../identity/contracts.js';
import {
  LEFT_OUT,
  type LeftOut,
  type MemberInfo,
  Snippet,
  TextInfo,
  TextPage,
} from '../../../processing/contracts.js';
import type { Via } from '../../application/grouping.js';
import type {
  HubCourseView,
  HubLinkView,
  LinkablePortalCourseView,
  LinkableView,
} from '../../application/hub-courses.js';
import type {
  CourseView,
  FileDetailsView,
  FileResultView,
  FileView,
  ItemView,
  PortalCourseView,
  PostResultView,
  SearchPageView,
  SearchView,
} from '../../application/views.js';

// The views the REST API answers with, described for OpenAPI. A branded
// value names its type: the decorator's metadata only sees an Object.

export class PortalCourseResponse implements PortalCourseView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({ description: "the course's id on its portal", example: '297' })
  externalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'the course on its portal',
  })
  url!: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 2026 })
  year!: number | null;
  @ApiProperty({
    enum: ['account', 'pick', 'link'],
    description:
      "how you read it: account, through your own account of its portal; pick, a public portal's course you picked; link, through the hub's account, in a course an admin made",
  })
  via!: Via;
}

export class CourseResponse implements CourseView {
  @ApiProperty({ example: 'os' }) slug!: string;
  @ApiProperty({ example: 'Operativni sistemi' }) name!: string;
  @ApiProperty({
    type: [String],
    example: ['canvas'],
    description: 'the portals its portal courses come from, each once',
  })
  sources!: PortalId[];
  @ApiProperty({
    type: [PortalCourseResponse],
    description:
      'by year, those that span years last; a pick you show with this course after them',
  })
  portalCourses!: PortalCourseResponse[];
}

export class ItemResponse implements ItemView {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({ example: 'announcement' }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: Date, nullable: true }) publishedAt!: Date | null;
  @ApiProperty({
    description:
      "the portal's own data, as the connector sent it; null while the post is locked for your account, or not open yet",
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  raw!: Json | null;
}

export class PostTextResponse {
  @ApiProperty({
    description:
      "the post's text as the hub reads it, plain text: render it as text",
  })
  text!: string;
}

export class FileResponse implements FileView {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'the item (post) it came with',
  })
  itemId!: string | null;
  @ApiProperty({ example: 'l5.pdf' }) name!: string;
  @ApiProperty({ description: "folder in the portal, '' for the root" })
  path!: string;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: Number, nullable: true }) size!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'application/pdf' })
  mime!: MediaType | null;
  @ApiProperty({ description: 'the hub has the bytes' }) hasContent!: boolean;
}

export class TextInfoResponse implements TextInfo {
  @ApiProperty({ type: String, example: 'office-text' })
  processor!: PluginName;
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'pages, slides or sections' }) pages!: number;
}

export class FileDetailsResponse
  extends FileResponse
  implements FileDetailsView
{
  @ApiProperty({ type: [TextInfoResponse] }) texts!: TextInfoResponse[];
}

export class MemberResponse implements MemberInfo {
  @ApiProperty({
    example: 'lab1/src/main.c',
    description:
      "its path in the file, a nested archive's members under its own",
  })
  path!: string;
  @ApiProperty({ type: Number, nullable: true }) size!: number | null;
  @ApiProperty({ type: String, nullable: true, example: 'text/x-c' })
  mime!: MediaType | null;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: LEFT_OUT,
    description:
      "why the hub kept none of it: past a member's limit, past the archive's, a path listed twice, an archive nested too deep to open; null if kept",
  })
  leftOut!: LeftOut | null;
  @ApiProperty({ type: [TextInfoResponse] }) texts!: TextInfoResponse[];
}

export class TextPageResponse extends TextInfoResponse implements TextPage {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty() text!: string;
}

export class SnippetResponse implements Snippet {
  @ApiProperty({
    description:
      'up to 400 characters of the page as indexed: plain text, whatever HTML the file had included, so render it as text',
  })
  text!: string;
  @ApiProperty({
    description:
      'where the words matched: [start, end) UTF-16 offsets into snippet.text; render as text',
    type: 'array',
    items: {
      type: 'array',
      items: { type: 'integer' },
      minItems: 2,
      maxItems: 2,
    },
    example: [[12, 18]],
  })
  highlights!: [start: number, end: number][];
}

export class SearchPageResponse implements SearchPageView {
  @ApiProperty({ example: 3 }) page!: number;
  @ApiProperty({
    type: String,
    example: 'office-text',
    description: 'whose text it is, for GET /api/files/{id}/text',
  })
  processor!: PluginName;
  @ApiProperty() snippet!: SnippetResponse;
}

export class FileResultResponse implements FileResultView {
  @ApiProperty({
    enum: ['file', 'member'],
    description: 'a file, or a member of an archive the file is',
  })
  type!: 'file' | 'member';
  @ApiProperty() fileId!: string;
  @ApiProperty({ example: 'l5.pdf' }) name!: string;
  @ApiProperty({ description: "folder in the portal, '' for the root" })
  path!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'lab1/src/main.c',
    description:
      'the path in the file of the member found (GET /api/files/{fileId}/members), null for the file itself',
  })
  member!: string | null;
  @ApiProperty({ example: 'os', description: "the course's slug" })
  course!: string;
  @ApiProperty({
    type: [SearchPageResponse],
    description:
      'its best pages first, at most 3; none when only its name matched',
  })
  pages!: SearchPageResponse[];
  @ApiProperty({
    type: SnippetResponse,
    nullable: true,
    description:
      "its name (a member's path) where the words matched, null when only its text did",
  })
  matchedName!: SnippetResponse | null;
  @ApiProperty({
    type: [String],
    description: 'other files of your courses with the same content',
  })
  sameContentIn!: string[];
}

export class PostResultResponse implements PostResultView {
  @ApiProperty({ enum: ['post'] }) type!: 'post';
  @ApiProperty({ description: 'GET /api/items/{itemId}' }) itemId!: string;
  @ApiProperty({ example: 'announcement' }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: Date, nullable: true }) publishedAt!: Date | null;
  @ApiProperty({ example: 'os', description: "the course's slug" })
  course!: string;
  @ApiProperty({
    description:
      'its best fragment, of its title and what the portal gave as plain text',
  })
  snippet!: SnippetResponse;
}

@ApiExtraModels(FileResultResponse, PostResultResponse)
export class SearchResponse implements SearchView {
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(FileResultResponse) },
        { $ref: getSchemaPath(PostResultResponse) },
      ],
      discriminator: {
        propertyName: 'type',
        mapping: {
          file: getSchemaPath(FileResultResponse),
          member: getSchemaPath(FileResultResponse),
          post: getSchemaPath(PostResultResponse),
        },
      },
    },
    description: 'best first, a file, a member or a post each (`type`)',
  })
  results!: (FileResultResponse | PostResultResponse)[];
}

export class DownloadResponse {
  @ApiProperty({
    example: '/api/downloads/qWmZ0cPj3o8bX1x2l9aYtA',
    description: 'GET it for the zip, within ten minutes',
  })
  url!: string;
  @ApiProperty({
    example: 'Operativni sistemi.zip',
    description: "the course's name when all are of one, else UniHub",
  })
  name!: string;
  @ApiProperty({ example: 3, description: 'how many files, once each' })
  count!: number;
  @ApiProperty({
    example: 1048576,
    description: 'their sizes in bytes together, as stored',
  })
  size!: number;
}

export class CourseRefResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'os' }) slug!: string;
  @ApiProperty({ example: 'Operativni sistemi' }) name!: string;
}

export class HubLinkResponse implements HubLinkView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({
    example: 'Canvas',
    description:
      'the name the portal is shown by, its id unless the hub names it',
  })
  label!: string;
  @ApiProperty({
    enum: ['shared', 'token', 'public'],
    description:
      "how the portal is read: shared, by the hub account; token, by users' own accounts; public, by whoever picked the course",
  })
  mode!: LinkMode;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'https://canvas.example.edu',
    description:
      "the school's site the portal course is of, for a portal that is a site per school; null for a portal of one site",
  })
  instance!: string | null;
  @ApiProperty({ description: "the course's id on its portal" })
  externalId!: string;
  @ApiProperty({ type: Number, nullable: true, example: 2026 })
  year!: number | null;
  @ApiProperty({
    description:
      "whether unlinking reaches this link: it is of the site the portal's settings read now",
  })
  unlinkable!: boolean;
  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "the portal course's name as the hub account sees it; null for a portal read with users' own accounts (what those hold is theirs), or when the hub account sees none",
  })
  name!: string | null;
}

export class HubCourseResponse implements HubCourseView {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'os' }) slug!: string;
  @ApiProperty({ example: 'Operativni sistemi' }) name!: string;
  @ApiProperty({ description: 'how many users are granted the course' })
  readers!: number;
  @ApiProperty({
    type: [HubLinkResponse],
    description: 'the portal courses linked to it, by year',
  })
  links!: HubLinkResponse[];
}

export class CourseReaderResponse implements CourseReaderDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ description: 'banned now, for good or until a time to come' })
  banned!: boolean;
}

export class LinkablePortalCourseResponse implements LinkablePortalCourseView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty({ example: 'Canvas' }) label!: string;
  @ApiProperty({ enum: ['shared', 'public'] }) mode!: 'shared' | 'public';
  @ApiProperty({ description: "the course's id on its portal" })
  externalId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    type: CourseRefResponse,
    nullable: true,
    description: 'the course it is linked to now, if any',
  })
  course!: CourseRefResponse | null;
}

export class LinkableResponse implements LinkableView {
  @ApiProperty({ description: 'how many portal courses match, on every page' })
  total!: number;
  @ApiProperty({ type: [LinkablePortalCourseResponse], description: 'by name' })
  portalCourses!: LinkablePortalCourseResponse[];
}
