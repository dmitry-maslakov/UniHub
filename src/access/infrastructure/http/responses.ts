import { ApiProperty } from '@nestjs/swagger';

// what the REST API answers with, described for OpenAPI

export class PortalCourseResponse {
  @ApiProperty({ example: 'canvas' }) portal!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true, example: 2026 })
  year!: number | null;
}

export class CourseResponse {
  @ApiProperty({ example: 'os' }) slug!: string;
  @ApiProperty({ example: 'Operativni sistemi' }) name!: string;
  @ApiProperty({ type: [PortalCourseResponse] })
  portalCourses!: PortalCourseResponse[];
}

export class ItemResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'canvas' }) portal!: string;
  @ApiProperty({ example: 'announcement' }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @ApiProperty({ type: String, nullable: true }) url!: string | null;
  @ApiProperty({ type: Date, nullable: true }) publishedAt!: Date | null;
  @ApiProperty({
    description: "the portal's own data, as the connector sent it",
    type: 'object',
    additionalProperties: true,
  })
  raw!: unknown;
}

export class FileResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'canvas' }) portal!: string;
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
  @ApiProperty({ type: String, nullable: true }) mime!: string | null;
  @ApiProperty({ description: 'the hub has the bytes' }) hasContent!: boolean;
}

export class TextInfoResponse {
  @ApiProperty({ example: 'office-text' }) processor!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ description: 'pages, slides or sections' }) pages!: number;
}

export class FileDetailsResponse extends FileResponse {
  @ApiProperty({ type: [TextInfoResponse] }) texts!: TextInfoResponse[];
}

export class TextPageResponse {
  @ApiProperty({ example: 'office-text' }) processor!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty() pages!: number;
  @ApiProperty() text!: string;
}
