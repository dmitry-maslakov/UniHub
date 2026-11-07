export default {
  title: 'Search',
  description:
    'Find a word in the posts and files of your courses, including the text inside slides, documents and archives.',
  field: {
    aria: 'Search your courses',
    placeholder: 'A word, a phrase or a function name',
    tooShort: 'Type at least 2 characters to search',
  },
  action: 'Search',
  searching: 'Searching',
  results: {
    aria: 'Results',
  },
  empty: {
    title: 'Nothing matches “{{q}}”',
    body: 'Try other words, or fewer.',
  },
  error: {
    rateLimited:
      'Slow down: search allows 20 searches a minute. Wait a moment, then search again.',
    unavailable:
      'Search is unavailable right now. Try again in a little while.',
    other: "Couldn't search just now. Try again.",
  },
  result: {
    download: 'Download',
    inCourse: 'In the course',
    openPost: 'Open post',
    postIn: 'Post in {{course}}',
    inArchive: 'In {{archive}}',
    page: 'page {{n}}',
  },
};
