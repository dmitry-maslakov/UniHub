export default {
  title: 'Admin',
  description: 'The users and the courses of this hub.',
  tabs: {
    users: 'Users',
    courses: 'Courses',
  },
  users: {
    search: {
      aria: 'Search users',
      placeholder: 'Search by email, or by name as written',
    },
    count_one: '{{count}} user',
    count_few: '{{count}} users',
    count_other: '{{count}} users',
    aria: 'Users',
    empty: {
      title: 'No user matches “{{q}}”',
      body: 'Try the email, or the name as the user wrote it.',
    },
    badge: {
      admin: 'Admin',
      banned: 'Banned',
      you: 'You',
    },
    unconfirmed: 'Email not confirmed',
    bannedUntil: 'Banned until {{date}}',
    joined: 'Joined {{date}}',
    actions: {
      aria: 'Actions for {{name}}',
      makeAdmin: 'Make admin',
      removeAdmin: 'Remove admin',
      ban: 'Ban…',
      unban: 'Unban',
    },
    makeAdmin: {
      confirm: {
        title: 'Make {{name}} an admin?',
        body: 'Admins read every shared course and manage users and courses.',
        action: 'Make admin',
      },
    },
    removeAdmin: {
      confirm: {
        title: 'Remove {{name}} as admin?',
        body: 'They keep their account and read only the courses granted to them.',
        action: 'Remove admin',
      },
    },
    ban: {
      title: 'Ban {{name}}?',
      body: 'A banned user is signed out and reads nothing, by any key or app, until unbanned.',
      duration: {
        label: 'For how long',
        day: 'One day',
        week: 'One week',
        month: '30 days',
        forever: 'Until unbanned',
      },
      reason: {
        label: 'Reason',
        help: 'Only admins see it.',
      },
      action: 'Ban',
    },
    notify: {
      madeAdmin: '{{name}} is an admin now.',
      removedAdmin: '{{name}} is no longer an admin.',
      banned: '{{name}} is banned.',
      unbanned: '{{name}} is unbanned.',
    },
    failed: "That didn't go through. Try again.",
  },
  courses: {
    new: {
      title: 'New course',
      description:
        'A course gathers portal courses under one name and address.',
      name: {
        label: 'Name',
        required: 'Name the course',
      },
      slug: {
        label: 'Address',
        help: 'Lower-case letters, digits and dashes.',
        invalid: 'Use lower-case letters, digits and single dashes',
        taken: 'Another course has this address',
      },
      action: 'Create course',
    },
    list: {
      title: 'Courses',
      aria: 'Courses',
      links_one: '{{count}} portal course',
      links_few: '{{count}} portal courses',
      links_other: '{{count}} portal courses',
      readers_one: '{{count}} reader',
      readers_few: '{{count}} readers',
      readers_other: '{{count}} readers',
      empty: {
        title: 'No courses yet',
        body: 'Create one above, then link portal courses to it.',
      },
    },
  },
  course: {
    back: 'All courses',
    notFound: {
      title: 'Course not found',
      description: 'No course has this id.',
    },
    links: {
      title: 'Portal courses',
      description:
        "What this course gathers. Its readers read the shared portals' courses here; a public site's course shows here for whoever picked it, and a course read through users' own accounts for whoever's account sees it.",
      aria: 'Linked portal courses',
      year: '{{from}}/{{to}}',
      anyYear: 'Every year',
      ownAccounts: "Read by users' own accounts",
      empty: {
        title: 'Nothing linked yet',
        body: 'Link a portal course below.',
      },
      unlink: {
        action: 'Unlink',
        aria: 'Unlink {{name}}',
        confirm: {
          title: 'Unlink {{name}}?',
          body: 'It stops showing in this course. Nothing is deleted.',
          action: 'Unlink',
        },
      },
      form: {
        label: 'Portal course',
        placeholder: 'Search by name',
        option: {
          plain: '{{name}} · {{portal}}',
          elsewhere: '{{name}} · {{portal}} (in {{course}})',
        },
        nothing: 'No portal course by that name',
        year: {
          label: 'Academic year',
          placeholder: '2026 for 2026/27',
        },
        action: 'Link',
        moves: 'A portal course linked to another course moves here.',
        picks:
          "A public site's course linked here shows here for everyone who picked it, whatever they chose to show it with.",
      },
      picked: 'Shown to whoever picked it',
    },
    readers: {
      title: 'Readers',
      description: 'Users who read this course besides admins.',
      empty: {
        title: 'No one yet',
        body: 'Give a user access below.',
      },
      remove: {
        action: 'Remove',
        aria: 'Remove access for {{name}}',
        confirm: {
          title: "Remove {{name}}'s access?",
          body: 'They stop reading this course, unless their own accounts see it.',
          action: 'Remove access',
        },
      },
      form: {
        label: 'User',
        placeholder: 'Search by email or name',
        nothing: 'No user with that email or name',
        action: 'Give access',
      },
    },
    notify: {
      linked: 'Linked.',
      unlinked: 'Unlinked.',
      granted: '{{name}} can read this course now.',
      revoked: "{{name}}'s access is removed.",
    },
    failed: "That didn't go through. Try again.",
  },
};
