export default {
  title: 'Connect AI',
  description:
    'Let an AI app read your courses as you: read-only, and you can cut it off here at any time.',
  keys: {
    title: 'API keys',
    description:
      "For apps that can't sign in by themselves. A key expires after 90 days, and changing your password revokes them all.",
    new: {
      label: 'New key',
      placeholder: 'Claude on my laptop',
      required: 'Name the key after where it goes',
      action: 'Create key',
      failed: "Couldn't create the key. Try again.",
    },
    freshSession:
      "To create an API key, you need to have signed in within the last day. You'll come straight back here.",
    created: {
      title: 'Copy your new key now',
      body: "You won't be able to see it again. Paste it into your app's settings.",
      copy: 'Copy key',
    },
    list: {
      aria: 'Your API keys',
      title: 'Your keys',
    },
    unnamed: 'Unnamed key',
    meta: {
      created: 'Created {{date}}',
      expires: 'Expires {{date}}',
      used: 'Last used {{date}}',
      neverUsed: 'Never used',
    },
    loading: 'Loading your keys',
    empty: {
      title: 'No keys yet',
      body: "Name one after the app or computer it's for, so you know which to revoke.",
    },
    revoke: {
      action: 'Revoke',
      aria: 'Revoke {{name}}',
      confirm: {
        title: 'Revoke “{{name}}”?',
        body: "Anything using this key loses access at once. This can't be undone.",
        action: 'Revoke key',
      },
      failed: "Couldn't revoke the key. Try again.",
    },
    notify: {
      revoked: 'Key revoked. Apps using it are signed out.',
    },
  },
};
