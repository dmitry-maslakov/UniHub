import { ApiProperty } from '@nestjs/swagger';
import type { Json, MediaType, PluginName, PortalId } from '@app/kernel';
import {
  LEFT_OUT,
  type LeftOut,
  type MemberInfo,
  Snippet,
  TextInfo,
  TextPage,
} from '../../../processing/contracts.js';
import type {
  CourseView,
  FileDetailsView,
  FileView,
  ItemView,
  PortalCourseView,
  SearchPageView,
  SearchResultView,
  SearchView,
} from '../../application/views.js';

// The views the REST API answers with, described for OpenAPI. A branded
// value names its type: the decorator's metadata only sees an Object.

export class PortalCourseResponse implements PortalCourseView {
  @ApiProperty({ type: String, example: 'canvas' }) portal!: PortalId;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true, example: 2026 })
  year!: number | null;
}

export class CourseResponse implements CourseView {
  @ApiProperty({ example: 'os' }) slug!: string;
  @ApiProperty({ example: 'Operativni sistemi' }) name!: string;
  @ApiProperty({ type: [PortalCourseResponse] })
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
    description: "the portal's own data, as the connector sent it",
    type: 'object',
    additionalProperties: true,
  })
  raw!: Json;
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

export class SearchResultResponse implements SearchResultView {
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
    description: 'its best pages first, at most 3',
  })
  pages!: SearchPageResponse[];
  @ApiProperty({
    type: [String],
    description: 'other files of your courses with the same content',
  })
  sameContentIn!: string[];
}

export class SearchResponse implements SearchView {
  @ApiProperty({ type: [SearchResultResponse] })
  results!: SearchResultResponse[];
}
