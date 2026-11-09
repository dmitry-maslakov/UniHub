export default {
  head: 'File',
  notFound: {
    title: 'File not found',
    description: "It may have been removed, or it isn't open to you.",
    back: 'Back to the course',
  },
  backToResults: 'Back to search results',
  backToArchive: 'Back to {{archive}}',
  meta: {
    inArchive: 'In {{archive}}',
  },
  open: 'Open the original',
  download: 'Download',
  loading: 'Loading the file',
  text: {
    title: 'Text',
    loading: 'Loading the text',
    which: 'Which text to read',
  },
  view: {
    which: 'Which view to read in',
    text: 'Text',
    page: 'Page',
    failed: "The picture couldn't be loaded.",
  },
  position: {
    page: 'Page {{n}} of {{total}}',
    slide: 'Slide {{n}} of {{total}}',
    section: 'Part {{n}} of {{total}}',
  },
  at: {
    page: 'Page {{n}}',
    slide: 'Slide {{n}}',
    section: 'Part {{n}}',
  },
  pagination: {
    previous: 'Previous part',
    next: 'Next part',
    page: 'Part {{n}}',
  },
  noContent: {
    title: 'Not available yet',
    body: "UniHub doesn't have this file's content yet, or it isn't open to you yet. Check again later.",
  },
  noText: {
    title: 'No text in this file',
    body: "UniHub couldn't read text from it. Open the original to see it.",
  },
  noPage: {
    title: "This part isn't there",
    body: 'The file may have changed since. <first>Go to its first part.</first>',
  },
  emptyPage: {
    title: 'No text on this part',
    body: 'It may be a picture. Open the original to see it.',
  },
  members: {
    title: 'Inside this archive',
    description: 'Open one to read its text.',
    aria: 'Files in the archive',
    loading: 'Loading the files in the archive',
    noText: 'No text',
    leftOut: {
      TOO_LARGE: 'Left out: too large',
      OVER_BUDGET: 'Left out: the archive holds too much',
      DUPLICATE_PATH: 'Left out: another file has the same path',
      TOO_DEEP: 'Left out: nested too deep',
    },
  },
  type: {
    pdf: 'PDF',
    slides: 'Slides',
    document: 'Document',
    spreadsheet: 'Spreadsheet',
    archive: 'Archive',
    image: 'Image',
    text: 'Text',
    code: 'Code',
    other: 'File',
  },
};
