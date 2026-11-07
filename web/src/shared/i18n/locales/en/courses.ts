export default {
  list: {
    title: 'My courses',
    description:
      'The courses you read here, the same ones your AI apps read for you.',
    descriptionEmpty:
      'Nothing to read yet. Link your own account of a portal, or pick courses from a public site, and they show up here.',
    aria: 'Your courses',
    noSource: 'No source yet',
    loading: 'Loading your courses',
    empty: {
      title: 'No courses yet',
      body: 'Link a portal account or pick public courses under Sources, and they show up here. An admin can also give you a course.',
      action: 'Add a source',
    },
    addSource: {
      title: 'Add a source',
    },
  },
  course: {
    head: 'Course',
    notFound: {
      title: 'Course not found',
      description: "It may have been removed, or it isn't one of yours.",
      back: 'Back to My courses',
    },
  },
  sources: {
    aria: 'Sources',
    withYear: '{{name}} ({{year}})',
    via: {
      account: 'through your account',
      pick: 'picked by you',
      link: 'added by an admin',
    },
  },
  posts: {
    title: 'Posts',
    aria: 'Posts',
    loading: 'Loading posts',
    empty: {
      title: 'No posts yet',
      body: "Posts from this course's portals show up here once UniHub reads them.",
    },
    more: 'Show more posts',
    openOn: 'On {{portal}}',
    openOnAria: 'Open {{title}} on {{portal}}',
  },
  files: {
    title: 'Files',
    loading: 'Loading files',
    empty: {
      title: 'No files yet',
      body: "Files from this course's portals show up here once UniHub reads them.",
    },
    more: 'Show more files',
    download: 'Download',
    downloadAria: 'Download {{name}}',
  },
};
