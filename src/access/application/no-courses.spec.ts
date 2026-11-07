import { noCoursesNote } from './no-courses.js';

const SOURCES = 'https://hub.example.edu/sources';
const canvas = {
  label: 'Canvas',
  linked: false,
  picked: null,
  firstSync: false,
};
const catalog = { ...canvas, label: 'Course catalog', picked: 0 };

describe('why a user reads no course', () => {
  it('says an account just linked is being read for the first time', () => {
    expect(
      noCoursesNote(
        [catalog, { ...canvas, linked: true, firstSync: true }],
        SOURCES,
      ),
    ).toBe(
      "No courses yet: the user's Canvas account was just linked and is being read for the first time. Ask again in a few minutes.",
    );
  });

  it('says where to connect a source when the user has none of their own', () => {
    for (const sources of [[], [canvas, catalog]])
      expect(noCoursesNote(sources, SOURCES)).toBe(
        "No courses: the user hasn't connected a source yet. They can at https://hub.example.edu/sources.",
      );
  });

  it('says nothing it would have to guess, with an account read or a course picked', () => {
    expect(noCoursesNote([{ ...canvas, linked: true }], SOURCES)).toBeNull();
    expect(noCoursesNote([{ ...catalog, picked: 2 }], SOURCES)).toBeNull();
  });
});
