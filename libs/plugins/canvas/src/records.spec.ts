import type { CanvasFile, Course } from './canvas.types.js';
import {
  announcementRecord,
  assignmentRecord,
  courseRecord,
  fileRecord,
  folderPath,
  moduleRecord,
  pageRecord,
} from './records.js';

const BASE = 'https://canvas.example.edu';

const course: Course = {
  id: 101,
  name: 'my OS',
  original_name: 'Operating Systems',
  course_code: 'OS-2026',
  start_at: '2026-10-01T00:00:00Z',
  end_at: null,
  term: { name: 'Fall 2026', start_at: '2026-09-28T00:00:00Z', end_at: null },
};

const file: CanvasFile = {
  id: 3001,
  display_name: 'lecture-1.pdf',
  folder_id: 2,
  url: `${BASE}/files/3001/download?download_frd=1&verifier=k`,
  size: 16,
  'content-type': 'application/pdf',
  modified_at: '2026-09-30T12:00:00Z',
  updated_at: '2026-10-02T12:00:00Z',
};

describe('Canvas as records', () => {
  it('names a course by its own name, not the nickname the user gave it', () => {
    expect(courseRecord(BASE, course)).toEqual({
      externalId: '101',
      name: 'Operating Systems',
      url: `${BASE}/courses/101`,
      meta: {
        course_code: 'OS-2026',
        term: {
          name: 'Fall 2026',
          start_at: '2026-09-28T00:00:00Z',
          end_at: null,
        },
        start_at: '2026-10-01T00:00:00Z',
        end_at: null,
      },
    });
    const { original_name: _, ...plain } = course;
    expect(courseRecord(BASE, { ...plain, name: 'Networks' }).name).toBe(
      'Networks',
    );
  });

  it('gives each kind of item an id space of its own', () => {
    const html_url = `${BASE}/courses/101/x`;
    expect(
      [
        moduleRecord(BASE, '101', { id: 5, name: 'Week 1' }),
        announcementRecord('101', {
          id: 5,
          title: 'Welcome',
          html_url,
          posted_at: '2026-10-01T09:00:00Z',
        }),
        pageRecord('101', { page_id: 5, url: 'lab', title: 'Lab', html_url }),
        assignmentRecord('101', { id: 5, name: 'Homework', html_url }),
      ].map(({ externalId, kind, course }) => [externalId, kind, course]),
    ).toEqual([
      ['module:5', 'module', '101'],
      ['topic:5', 'announcement', '101'],
      ['page:5', 'page', '101'],
      ['assignment:5', 'assignment', '101'],
    ]);
  });

  it('dates an announcement by when it was posted, and links a module', () => {
    expect(
      announcementRecord('101', {
        id: 7,
        title: 'Welcome',
        html_url: `${BASE}/courses/101/discussion_topics/7`,
        posted_at: '2026-10-01T09:00:00Z',
      }),
    ).toMatchObject({
      title: 'Welcome',
      url: `${BASE}/courses/101/discussion_topics/7`,
      publishedAt: new Date('2026-10-01T09:00:00Z'),
    });
    expect(moduleRecord(BASE, '101', { id: 5, name: 'Week 1' }).url).toBe(
      `${BASE}/courses/101/modules/5`,
    );
  });

  it("files a file under its folder's path, linked to its page in the course", () => {
    const path = folderPath('course files/Lectures/2026')!;
    expect(fileRecord(BASE, '101', file, { item: 'topic:7', path })).toEqual({
      externalId: '3001',
      course: '101',
      item: 'topic:7',
      name: 'lecture-1.pdf',
      path: 'Lectures/2026',
      url: `${BASE}/courses/101/files/3001`,
      size: 16,
      mime: 'application/pdf',
      updatedAt: new Date('2026-09-30T12:00:00Z'),
    });
    expect(folderPath('course files')).toBe('');
  });

  it("leaves out the course card's picture", () => {
    expect(folderPath('course files/course_image')).toBeNull();
    expect(folderPath('course files/Lectures/course_image')).toBe(
      'Lectures/course_image',
    );
  });

  it('puts unfiled files at the root', () => {
    expect(folderPath('course files/unfiled')).toBe('');
    expect(folderPath('course files/Lectures/unfiled')).toBe(
      'Lectures/unfiled',
    );
  });

  it('dates a file by its update when Canvas has no modified_at', () => {
    const { modified_at: _, ...older } = file;
    expect(fileRecord(BASE, '101', older)).toMatchObject({
      path: undefined,
      updatedAt: new Date('2026-10-02T12:00:00Z'),
    });
  });
});
