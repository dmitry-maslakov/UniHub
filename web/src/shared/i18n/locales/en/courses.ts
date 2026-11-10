export default {
  list: {
    title: 'My courses',
    description:
      'The courses you follow. Your AI apps read these, the ones you hide, and every public source.',
    descriptionEmpty:
      'Nothing to read yet. Link your own account of a portal, or pick courses from a public site, and they show up here.',
    aria: 'Your courses',
    noSource: 'No source yet',
    allHidden: 'You hide all of your courses. Show one from the list below.',
    loading: 'Loading your courses',
    empty: {
      title: 'No courses yet',
      body: 'Link a portal account or pick public courses under Sources, and they show up here. An admin can also give you a course.',
      action: 'Add a source',
    },
    addSource: {
      title: 'Add a source',
    },
    firstSync: {
      title: 'Reading your {{label}} for the first time',
      body: 'Your courses show up here in a few minutes. You can leave this page open.',
    },
  },
  hidden: {
    title: 'Hidden',
    description:
      'Courses you keep out of the list above. You still read them, search can look in them, and your AI apps read them as before.',
    aria: 'Hidden courses',
  },
  hide: {
    action: 'Hide',
    aria: 'Hide {{name}} from My courses',
    show: 'Show in My courses',
    showAria: 'Show {{name}} in My courses',
    note: 'Not in My courses.',
    failed: "Couldn't hide the course. Try again.",
    showFailed: "Couldn't show the course. Try again.",
  },
  course: {
    head: 'Course',
    notFound: {
      title: 'Course not found',
      description: "It may have been removed, or it isn't one of yours.",
      back: 'Back to My courses',
    },
    processing: {
      text_one: 'Still reading this course: {{done}} of {{count}} file ready',
      text_few: 'Still reading this course: {{done}} of {{count}} files ready',
      text_other:
        'Still reading this course: {{done}} of {{count}} files ready',
      pictures_one:
        'Text is ready; pictures are read in the background: {{done}} of {{count}} file done',
      pictures_few:
        'Text is ready; pictures are read in the background: {{done}} of {{count}} files done',
      pictures_other:
        'Text is ready; pictures are read in the background: {{done}} of {{count}} files done',
    },
    tabs: {
      files: 'Files',
      filesCount: 'Files ({{count}})',
      posts: 'Posts',
    },
    search: {
      label: 'Search in this course',
      placeholder: 'Search its files and posts',
    },
  },
  sources: {
    aria: 'Sources',
    withYear: '{{name}} ({{year}})',
    via: {
      account: 'through your account',
      public: 'public source',
      link: 'added by an admin',
    },
  },
  posts: {
    aria: 'Posts',
    loading: 'Loading posts',
    empty: {
      title: 'No posts yet',
      body: "Posts from this course's portals show up here once UniHub reads them.",
    },
    more: 'Show more posts',
  },
  files: {
    aria: 'Files by folder',
    count_one: '{{count}} file',
    count_few: '{{count}} files',
    count_other: '{{count}} files',
    capped: 'Showing the first 2,000. Search finds the rest.',
    folderCount_one: '{{count}} file',
    folderCount_few: '{{count}} files',
    folderCount_other: '{{count}} files',
    loading: 'Loading files',
    empty: {
      title: 'No files yet',
      body: "Files from this course's portals show up here once UniHub reads them.",
    },
    view: {
      label: 'Show files',
      folders: 'By folder',
      newest: 'Newest first',
    },
    newest: {
      aria: 'Files, newest first',
    },
  },
};
