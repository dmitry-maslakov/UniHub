import { UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { Slug } from '../../../catalog/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { pageSchema, textPage } from '../../application/page.js';
import { McpErrorsFilter } from './mcp-errors.filter.js';
import { McpUserId } from './mcp-user-id.js';

const inCourse = pageSchema.extend({ course: Slug.describe('course slug') });
const fileText = z.object({
  file: z.uuid().describe('file id from list_files'),
  page: textPage,
});
const readOnly = { readOnlyHint: true, openWorldHint: false };

// what a tool hands back: JSON a model reads as text
const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

// The same reads as the REST API, through the same CourseReader
@McpController()
@UseFilters(McpErrorsFilter)
export class CourseTools {
  constructor(private readonly reader: CourseReader) {}

  @Tool({
    name: 'list_courses',
    description:
      "The user's courses, each with the portal courses (Canvas, Teams...) it is made of.",
    parameters: z.object({}),
    annotations: readOnly,
  })
  async courses(@McpUserId() userId: string) {
    return json(await this.reader.courses(userId));
  }

  @Tool({
    name: 'list_items',
    description:
      "Posts, announcements and pages of a course, newest first. `raw` is the portal's own data and usually holds the text.",
    parameters: inCourse,
    annotations: readOnly,
  })
  async items(
    @Payload() { course, ...page }: z.output<typeof inCourse>,
    @McpUserId() userId: string,
  ) {
    return json(await this.reader.items(userId, course, page));
  }

  @Tool({
    name: 'list_files',
    description:
      'Files of a course by folder and name. `itemId` is the post a file came with.',
    parameters: inCourse,
    annotations: readOnly,
  })
  async files(
    @Payload() { course, ...page }: z.output<typeof inCourse>,
    @McpUserId() userId: string,
  ) {
    return json(await this.reader.files(userId, course, page));
  }

  @Tool({
    name: 'read_file',
    description:
      'One page (slide, section) of the text made from a file, with how many pages there are. Read the next page with page + 1.',
    parameters: fileText,
    annotations: readOnly,
  })
  async read(
    @Payload() { file, page }: z.output<typeof fileText>,
    @McpUserId() userId: string,
  ) {
    const text = await this.reader.text(userId, file, page);
    return {
      content: [
        {
          type: 'text' as const,
          text: `page ${text.page} of ${text.pages} (${text.processor} v${text.version})\n\n${text.text}`,
        },
      ],
    };
  }
}
