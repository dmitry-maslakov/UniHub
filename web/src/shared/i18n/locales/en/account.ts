export default {
  title: 'Account',
  profile: {
    title: 'Profile',
    name: {
      label: 'Name',
      required: 'Enter your name',
      tooLong: 'Use at most 100 characters',
    },
    save: 'Save name',
    email: "Your email is {{email}}. It can't be changed here.",
    notify: {
      saved: 'Name saved.',
    },
    failed: "Couldn't save your name. Try again.",
  },
  password: {
    title: 'Password',
    description:
      'Changing it signs out your other devices, revokes your API keys and disconnects your AI apps.',
    none: "You sign in with Google, so there's no password here to change.",
    current: {
      label: 'Current password',
      required: 'Enter your current password',
    },
    next: {
      label: 'New password',
      help: 'At least 8 characters.',
    },
    confirm: {
      label: 'New password again',
    },
    action: 'Change password',
    notify: {
      changed: 'Password changed. This device stays signed in.',
    },
    failed: "Couldn't change your password. Try again.",
  },
  sessions: {
    title: 'Signed-in devices',
    description: 'Every browser and screen signed in to your account.',
    aria: 'Signed-in devices',
    device: '{{browser}} on {{os}}',
    unknownDevice: 'Unknown device',
    thisDevice: 'This device',
    signedIn: 'Signed in {{date}}',
    active: 'Active {{date}}',
    signOut: {
      action: 'Sign out',
      aria: 'Sign out {{device}}',
    },
    others: {
      action: 'Sign out everywhere else',
      confirm: {
        title: 'Sign out everywhere else?',
        body: 'Every other browser and screen is signed out. This one stays.',
        action: 'Sign out others',
      },
      failed: "Couldn't sign out your other devices. Try again.",
    },
    notify: {
      others: 'Signed out everywhere else.',
    },
    failed: "Couldn't sign that device out. Try again.",
  },
  screen: {
    title: 'Another screen',
    description:
      'Signing in on a shared computer or a TV? Scan the QR code it shows with this phone, or enter its code.',
    action: 'Enter a code',
  },
  delete: {
    title: 'Delete your account',
    description:
      'Deletes your account with its API keys, linked portal accounts, picked courses and connected apps, and what only your accounts brought in. Course content others can see stays.',
    open: 'Delete account…',
    confirm: {
      title: 'Delete your account?',
      body: "This can't be undone. You'll be signed out everywhere.",
    },
    password: {
      label: 'Your password',
      required: 'Enter your password',
    },
    keep: 'Keep my account',
    action: 'Delete account',
    freshSession:
      "To delete your account, you need to have signed in within the last day. You'll come straight back here.",
    failed: "Couldn't delete your account. Try again.",
    notify: {
      deleted: 'Your account is deleted.',
    },
  },
};
