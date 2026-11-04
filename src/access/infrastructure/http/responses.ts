import { ApiProperty } from '@nestjs/swagger';
import type { Json, MediaType, PluginName, PortalId } from '@app/kernel';
import type { TextInfo, TextPage } from '../../../processing/contracts.js';
import type {
  CourseView,
  FileDetailsView,
  FileView,
  ItemView,
  PortalCourseView,
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

export class TextPageResponse extends TextInfoResponse implements TextPage {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty() text!: string;
}
