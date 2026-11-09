import { UseFilters } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { CourseSlug } from '../../../catalog/contracts.js';
import { HubPages } from '../../../identity/contracts.js';
import { CourseReader } from '../../application/course-reader.js';
import {
  pageSchema,
  textPageSchema,
  viewSchema,
} from '../../application/page.js';
import { McpErrorsFilter } from './mcp-errors.filter.js';
import { McpUserId } from './mcp-user-id.js';
import { LimitedTool } from '../throttle.js';
import { json, jsonWithNote, prose, readOnly } from './tool-results.js';

const inCourse = pageSchema.extend({
  course: CourseSlug.describe('course slug'),
});
const post = z.object({
  item: z.uuid().describe('item id from list_items or search'),
});
const file = z.uuid().describe('file id from list_files or search');
const fileText = textPageSchema.extend({ file });
const fileView = viewSchema.extend({ file });
const fileMembers = pageSchema.extend({ file });

// The same reads as the REST API, through the same CourseReader
@McpController()
@UseFilters(McpErrorsFilter)
export class CourseTools {
  constructor(
    private readonly reader: CourseReader,
    private readonly pages: HubPages,
  ) {}

  @Tool({
    name: 'list_courses',
    description:
      "The user's courses as they see them, each with the portal courses (Canvas, a course site...) it is made of and `sources`, their portals. `via` says how the user reads a portal course: `account`, their own account; `pick`, a public site's course they picked; `link`, a course an admin set up. A pick the user shows with a course of their own is inside that course. When the list is empty, a second text may say why, to tell the user: an account of theirs just linked and still being read for the first time, or no source connected yet and where to connect one.",
    parameters: z.object({}),
    annotations: readOnly,
  })
  async courses(@McpUserId() userId: string) {
    const courses = await this.reader.courses(userId);
    const note = courses.length
      ? null
      : await this.reader.noCourses(userId, this.pages.url('/sources'));
    return note ? jsonWithNote(courses, note) : json(courses);
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
      "One page (slide, section) of the text made from a file, or from a file inside an archive (`member`, its path from list_members or search), with how many pages there are. Read the next page with page + 1. With no `processor` it gives every text there is of the page, each under its name, and `ocr` is read by machine off a picture and can have mistakes; diagrams and formulas aren't in the text, view_file shows them. A file can have a text per processor, each paged on its own: read a page from search with the processor it names.",
    parameters: fileText,
    annotations: readOnly,
  })
  async read(
    @Payload() { file, ...at }: z.output<typeof fileText>,
    @McpUserId() userId: string,
  ) {
    if (at.processor !== undefined) {
      const text = await this.reader.text(userId, file, at);
      return prose(
        `page ${text.page} of ${text.pages} (${text.processor} v${text.version})\n\n${text.text}`,
      );
    }
    const { page, pages, texts } = await this.reader.texts(userId, file, at);
    // longest first; one with nothing in it isn't worth a heading
    const shown = texts.filter(({ text }) => text.trim() !== '');
    return prose(
      `page ${page} of ${pages}\n\n` +
        (shown.length === 0
          ? '(no text on this page: view_file shows it)'
          : shown
              .map(
                ({ processor, version, text }) =>
                  `--- ${processor} v${version} ---\n${text}`,
              )
              .join('\n\n')),
    );
  }

  @Tool({
    name: 'view_file',
    description:
      "An image file, or one page of a PDF (`page`, from 1), or the same of a file inside an archive (`member`), as a picture. Use it to see an image, a scan, or a diagram or formula that a page's text from read_file doesn't carry. Any other file is not viewable.",
    parameters: fileView,
    annotations: readOnly,
  })
  @LimitedTool('views')
  async view(
    @Payload() { file, ...at }: z.output<typeof fileView>,
    @McpUserId() userId: string,
  ) {
    const shown = await this.reader.view(userId, file, at);
    return {
      content: [
        {
          type: 'image' as const,
          data: shown.data.toString('base64'),
          mimeType: shown.mime,
        },
        {
          type: 'text' as const,
          text:
            shown.pages === null
              ? shown.name
              : `${shown.name}, page ${shown.page} of ${shown.pages}`,
        },
      ],
    };
  }
}
