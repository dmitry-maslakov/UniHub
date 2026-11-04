import type { CourseRecord, FileRecord, ItemRecord } from '@app/plugin-sdk';
import type {
  Assignment,
  CanvasFile,
  Course,
  Module,
  Page,
  Topic,
} from './canvas.types.js';
import { raw } from './visibility.js';

// Canvas's objects as the hub's records. Items of different kinds share
// one id space in the hub, Canvas's ids don't, hence the prefixes;
// announcements and discussions share theirs, so 'topic:'.

const at = (base: string, path: string) => new URL(path, base).href;

export const courseRecord = (base: string, course: Course): CourseRecord => ({
  externalId: String(course.id),
  // name is the token user's nickname for it when they gave one
  name: course.original_name ?? course.name,
  url: at(base, `/courses/${course.id}`),
  // an admin picks the year a course is for by these
  meta: {
    course_code: course.course_code,
    term: course.term
      ? {
          name: course.term.name,
          start_at: course.term.start_at,
          end_at: course.term.end_at,
        }
      : null,
    start_at: course.start_at,
    end_at: course.end_at,
  },
});

export const moduleRecord = (
  base: string,
  course: string,
  module: Module,
): ItemRecord => ({
  externalId: `module:${module.id}`,
  course,
  kind: 'module',
  title: module.name,
  url: at(base, `/courses/${course}/modules/${module.id}`),
  raw: raw(module),
});

export const announcementRecord = (
  course: string,
  topic: Topic,
): ItemRecord => ({
  externalId: `topic:${topic.id}`,
  course,
  kind: 'announcement',
  title: topic.title,
  url: topic.html_url,
  publishedAt: topic.posted_at ? new Date(topic.posted_at) : undefined,
  raw: raw(topic),
});

export const pageRecord = (course: string, page: Page): ItemRecord => ({
  externalId: `page:${page.page_id}`,
  course,
  kind: 'page',
  title: page.title,
  url: page.html_url,
  raw: raw(page),
});

export const assignmentRecord = (
  course: string,
  assignment: Assignment,
): ItemRecord => ({
  externalId: `assignment:${assignment.id}`,
  course,
  kind: 'assignment',
  title: assignment.name,
  url: assignment.html_url,
  raw: raw(assignment),
});

// 'course files/Lectures/2026' is 'Lectures/2026', the root ''
export const folderPath = (fullName: string) =>
  fullName.split('/').slice(1).join('/');

export const fileRecord = (
  base: string,
  course: string,
  file: CanvasFile,
  // the announcement it is attached to, and its folder's path when the
  // folders could be listed
  { item, path }: { item?: string; path?: string } = {},
): FileRecord => ({
  externalId: String(file.id),
  course,
  item,
  name: file.display_name,
  path,
  // its page in the course: the url Canvas gives is a key to the file
  url: at(base, `/courses/${course}/files/${file.id}`),
  size: file.size,
  mime: file['content-type'],
  updatedAt: new Date(file.modified_at ?? file.updated_at),
});
