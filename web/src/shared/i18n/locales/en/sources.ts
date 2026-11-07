export default {
  title: 'Sources',
  description:
    'Where UniHub reads your courses from. Link your own account, and UniHub reads the courses you follow there, as you see them; on a public site, pick the courses you follow.',
  list: {
    aria: 'Sources',
  },
  loading: 'Loading your sources',
  empty: {
    title: 'No sources yet',
    body: 'No sources are set up on this hub yet.',
  },
  status: {
    shared:
      "UniHub reads {{label}} for everyone now, so your own account isn't used. Unlink it if you like.",
    linked: 'Linked.',
    linkedUntil: 'Linked. The token works until {{date}}.',
    linkedTo: 'Linked to {{site}}.',
    linkedToUntil: 'Linked to {{site}}. The token works until {{date}}.',
    expired: 'Your token expired. Replace it to read {{label}} again.',
    revoked:
      '{{label}} no longer takes your token. Replace it to read {{label}} again.',
    notLinked: 'Not linked.',
  },
  unavailable:
    "Linking your own account isn't open to you on {{label}}. Ask an admin of the hub if you need it.",
  site: {
    label: "Your school's {{label}}",
    help: 'The address you open {{label}} at.',
    invalid: 'Enter the address you open {{label}} at, starting with https://',
    tokenHelp:
      "<anchor>Get a token</anchor> on your {{label}}'s Settings page: New access token, with a purpose and an expiry date.",
    getTokenAria: 'Get a token (opens {{label}} in a new tab)',
  },
  token: {
    label: 'Token',
    newLabel: 'New token',
    help: "The access token {{label}} gave you. It's sent once and never shown again.",
    empty: 'Paste your token first',
  },
  link: 'Link {{label}}',
  replace: 'Replace token',
  freshSession:
    "To link {{label}}, you need to have signed in within the last day. You'll come straight back here.",
  notify: {
    linked: '{{label}} is linked. Its courses show up after the next read.',
    unlinked: '{{label}} is unlinked.',
  },
  tokenError: {
    badToken:
      "That doesn't look like a token. It has no spaces or line breaks.",
    badSite:
      "That address or token doesn't look right. The address starts with https://, and a token has no spaces or line breaks.",
    urlNeeded:
      "Linking {{label}} needs your school's address, which this page can't take yet. Ask an admin of the hub.",
    refused: "{{label}} didn't accept that token. Check it and try again.",
    notAllowed:
      "{{host}} hosts this {{label}}, and lets apps in only by OAuth, never by a pasted token, so UniHub can't link it this way.",
    tooMany: 'Too many tries in a short time. Wait a minute, then try again.',
    unreachableSite:
      'No {{label}} answered at that address. Check it, or try again later.',
    unreachable: "{{label}} couldn't be reached just now. Try again later.",
    other: "Couldn't link the account. Try again.",
  },
  unlink: {
    action: 'Unlink',
    aria: 'Unlink {{label}}',
    confirm: {
      title: 'Unlink {{label}}?',
      body: 'UniHub forgets your token and stops reading {{label}} as you. Courses only your account saw stop showing up. You can link it again later.',
      action: 'Unlink',
    },
    failed: "Couldn't unlink the account. Try again.",
  },
  catalog: {
    picked_one: '{{count}} picked',
    picked_few: '{{count}} picked',
    picked_other: '{{count}} picked',
    nonePicked: 'None picked',
    description:
      'A public site anyone can read. Pick the courses you follow: they show up under My courses, and their posts and files once UniHub next reads the site. Show one with a course of your own to read the two in one place.',
    search: {
      label: 'Find a course',
      placeholder: 'Part of its name',
    },
    searching: 'Searching',
    loading: "Loading {{label}}'s courses",
    empty: {
      title: 'The site lists no courses yet',
      body: 'They show up here once UniHub reads them.',
    },
    noMatch: {
      title: "No course's name has “{{q}}”",
      body: 'Try part of a word, or fewer words.',
    },
    new: 'New',
    open: 'Open',
    openAria: 'Open {{name}} on its site',
  },
  pick: {
    failed: "Couldn't pick the course. Try again.",
    unpickFailed: "Couldn't unpick the course. Try again.",
    gone: 'That course is no longer in the catalog.',
    tooMany: 'You can pick up to {{max}} courses. Unpick one first.',
    tooFast: 'Too many changes in a short time. Wait a minute, then try again.',
  },
  showWith: {
    label: 'Show with',
    alone: 'On its own',
    suggested: 'Suggested',
    yours: 'Your courses',
    others: 'Your other courses',
    sameFiles: '{{name}} has some of the same files.',
    linked: 'Shown with {{name}}, as an admin linked it.',
    notYours:
      "That course isn't one you read through your own account any more.",
    failed: "Couldn't move the course. Try again.",
  },
};
