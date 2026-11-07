import { UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { CourseSlug } from '../../../catalog/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import { pageSchema, textPageSchema } from '../../application/page.js';
import { McpErrorsFilter } from './mcp-errors.filter.js';
import { McpUserId } from './mcp-user-id.js';
import { json, readOnly } from './tool-results.js';

const inCourse = pageSchema.extend({
  course: CourseSlug.describe('course slug'),
});
const post = z.object({
  item: z.uuid().describe('item id from list_items or search'),
});
const file = z.uuid().describe('file id from list_files or search');
const fileText = textPageSchema.extend({ file });
const fileMembers = pageSchema.extend({ file });

// The same reads as the REST API, through the same CourseReader
@McpController()
@UseFilters(McpErrorsFilter)
export class CourseTools {
  constructor(private readonly reader: CourseReader) {}

  @Tool({
    name: 'list_courses',
    description:
      "The user's courses as they see them, each with the portal courses (Canvas, a course site...) it is made of and `sources`, their portals. `via` says how the user reads a portal course: `account`, their own account; `pick`, a public site's course they picked; `link`, a course an admin set up. A pick the user shows with a course of their own is inside that course.",
    parameters: z.object({}),
    annotations: readOnly,
  })
  async courses(@McpUserId() userId: string) {
    return json(await this.reader.courses(userId));
  }

  @Tool({
    name: 'list_items',
    description:
      "Posts, announcements and pages of a course, newest first. `raw` is the portal's own data and usually holds the text; null while a post is locked for the user, or not open yet.",
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
    name: 'read_item',
    description:
      "One post, announcement or page, as list_items lists it: open a post search found. `raw` is the portal's own data and usually holds the text; null while it's locked for the user, or not open yet.",
    parameters: post,
    annotations: readOnly,
  })
  async item(
    @Payload() { item }: z.output<typeof post>,
    @McpUserId() userId: string,
  ) {
    return json(await this.reader.item(userId, item));
  }

  @Tool({
    name: 'list_files',
    description:
      'Files of a course by folder and name. `itemId` is the post a file came with; `changedAt` is when its portal last changed it, null when the portal gives no date.',
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
    name: 'list_members',
    description:
      "The files inside an archive (zip, tar, gz), in the order it lists them, each by its path: read one with read_file and its `member`. `texts` says which have text and how many pages; `leftOut` says why the hub kept none of one (too large, past the archive's budget, a path listed twice, an archive nested too deep). None for another file.",
    parameters: fileMembers,
    annotations: readOnly,
  })
  async members(
    @Payload() { file, ...page }: z.output<typeof fileMembers>,
    @McpUserId() userId: string,
  ) {
    return json(await this.reader.members(userId, file, page));
  }

  @Tool({
    name: 'read_file',
    description:
      'One page (slide, section) of the text made from a file, or from a file inside an archive (`member`, its path from list_members or search), with how many pages there are. Read the next page with page + 1. A file can have a text per processor, each paged on its own: read a page from search with the processor it names.',
    parameters: fileText,
    annotations: readOnly,
  })
  async read(
    @Payload() { file, ...at }: z.output<typeof fileText>,
    @McpUserId() userId: string,
  ) {
    const text = await this.reader.text(userId, file, at);
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
