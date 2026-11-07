import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  DownloadRequests,
  type DownloadRequest,
} from '../domain/download-requests.js';
import { zipEntryNames, type ZipItem } from '../domain/zip-entry-names.js';
import { CourseReader } from './course-reader.js';
import { DownloadTooLargeError, NotReadableError } from './errors.js';
import { memberSchema } from './page.js';

// Several files at once, as one zip: the files and the files inside
// archives a user ticked, from any of their courses.

// what one request may hold, in items and in bytes
const MAX_ITEMS = 500;
export const MAX_BYTES = 1024 ** 3;

// the zip of a request that spans courses
const NAME = 'UniHub';

export const downloadRequestSchema = z.object({
  items: z
    .array(
      memberSchema.extend({
        file: z.uuid().describe("a file's id"),
      }),
    )
    .min(1)
    .max(MAX_ITEMS)
    .describe(
      'the files to zip, and the files inside archives, each as GET /api/files/{id}/content names them',
    ),
});
export type DownloadItems = z.output<typeof downloadRequestSchema>['items'];

// one ticked once, whatever the client sent
const keyOf = ({ file, member }: DownloadRequest['items'][number]) =>
  `${file}\0${member ?? ''}`;

@Injectable()
export class Downloads {
  constructor(
    private readonly reader: CourseReader,
    private readonly requests: DownloadRequests,
  ) {}

  // Keeps a request for what the user may download now, each as
  // CourseReader.content decides, or none of it: one that isn't is a
  // NotReadableError naming nothing. Over MAX_BYTES in all is refused too.
  async request(userId: string, items: DownloadItems) {
    const unique = [...new Map(items.map((i) => [keyOf(i), i])).values()];
    const entries = await this.entries(userId, unique);
    const size = entries.reduce((sum, { entry }) => sum + (entry.size ?? 0), 0);
    if (size > MAX_BYTES) throw new DownloadTooLargeError(MAX_BYTES);
    const id = await this.requests.put({ userId, items: unique });
    return {
      id,
      name: await this.nameOf(userId, entries),
      count: unique.length,
      size,
    };
  }

  // What a request zips, as its owner may download it now: the zip's name,
  // and each entry's name, size and a way to open its bytes, which asks
  // again whether the user may read them. Another user's, an unknown or an
  // expired id is a NotReadableError.
  async open(userId: string, id: string) {
    const request = await this.requests.get(id);
    if (request?.userId !== userId) throw new NotReadableError('download');
    const entries = await this.entries(userId, request.items);
    const names = zipEntryNames(
      entries.map(({ item, entry }): ZipItem =>
        item.member === undefined
          ? { path: entry.path, name: entry.name }
          : {
              path: entry.path,
              archive: entry.archive!,
              member: item.member,
            },
      ),
    );
    return {
      name: await this.nameOf(userId, entries),
      entries: entries.map(({ item, entry }, i) => ({
        name: names[i]!,
        size: entry.size,
        open: async () =>
          (await this.reader.content(userId, item.file, item.member)).stream,
      })),
    };
  }

  private async entries(userId: string, items: DownloadRequest['items']) {
    const entries = [];
    for (const item of items)
      entries.push({
        item,
        entry: await this.reader.entry(userId, item.file, item.member),
      });
    return entries;
  }

  // the course's name when the items are all of one, else UniHub's
  private async nameOf(
    userId: string,
    entries: { entry: { course: string } }[],
  ) {
    const courses = new Set(entries.map(({ entry }) => entry.course));
    const [only] = courses;
    const name =
      courses.size === 1
        ? ((await this.reader.courseNames(userId)).get(only!) ?? NAME)
        : NAME;
    // a file name has no folders
    return `${name.replace(/[\\/]/g, '_')}.zip`;
  }
}
