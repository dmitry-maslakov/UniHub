import { RpcException } from '@nestjs/microservices';
import { Payload } from '@nestjs/microservices';
import { McpController, McpRawRequest, Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { userIdOf } from '../../../identity/contracts.js';
import { CourseReader, MAX_LIMIT } from '../../application/course-reader.js';

const page = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(MAX_LIMIT).default(50),
};
const readOnly = { readOnlyHint: true, openWorldHint: false };

// what a tool hands back: JSON a model reads as text
const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});
const found = <T>(value: T | null, what: string) => {
  if (value === null) throw new RpcException(`${what} not found`);
  return value;
};

// The same reads as the REST API, through the same CourseReader.
@McpController()
export class CourseTools {
  constructor(private readonly reader: CourseReader) {}

  @Tool({
    name: 'list_courses',
    description:
      "The user's courses, each with the portal courses (Canvas, Teams...) it is made of.",
    parameters: z.object({}),
    annotations: readOnly,
  })
  async courses(@Payload() _: unknown, @McpRawRequest() req: unknown) {
    return json(await this.reader.courses(userIdOf(req as never)));
  }

  @Tool({
    name: 'list_items',
    description:
      "Posts, announcements and pages of a course, newest first. `raw` is the portal's own data and usually holds the text.",
    parameters: z.object({
      course: z.string().describe('course slug'),
      ...page,
    }),
    annotations: readOnly,
  })
  async items(
    @Payload()
    {
      course,
      offset,
      limit,
    }: { course: string; offset: number; limit: number },
    @McpRawRequest() req: unknown,
  ) {
    const items = await this.reader.items(userIdOf(req as never), course, {
      offset,
      limit,
    });
    return json(found(items, 'course'));
  }

  @Tool({
    name: 'list_files',
    description:
      'Files of a course by folder and name. `itemId` is the post a file came with.',
    parameters: z.object({
      course: z.string().describe('course slug'),
      ...page,
    }),
    annotations: readOnly,
  })
  async files(
    @Payload()
    {
      course,
      offset,
      limit,
    }: { course: string; offset: number; limit: number },
    @McpRawRequest() req: unknown,
  ) {
    const files = await this.reader.files(userIdOf(req as never), course, {
      offset,
      limit,
    });
    return json(found(files, 'course'));
  }

  @Tool({
    name: 'read_file',
    description:
      'One page (slide, section) of the text made from a file, with how many pages there are. Read the next page with page + 1.',
    parameters: z.object({
      file: z.string().uuid().describe('file id from list_files'),
      page: z.number().int().min(1).default(1),
    }),
    annotations: readOnly,
  })
  async read(
    @Payload() { file, page }: { file: string; page: number },
    @McpRawRequest() req: unknown,
  ) {
    const text = found(
      await this.reader.text(userIdOf(req as never), file, page),
      'page',
    );
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
