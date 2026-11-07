export default {
  title: 'Connect AI',
  description:
    'Let an AI app read your courses as you: read-only, and you can cut it off here at any time.',
  address: {
    title: 'Your UniHub address for AI apps',
    description:
      'Give an AI app exactly this address. It sends you here to sign in and allow it.',
    label: 'MCP address',
  },
  guides: {
    title: 'Add UniHub to an app',
    description: 'Pick your app. Each takes a minute.',
    claude: {
      tab: 'Claude',
      step1:
        'In Claude (claude.ai or the desktop app), open Settings, then Connectors, and add a custom connector.',
      step2: 'Paste the address above as its URL.',
      step3:
        "Under its advanced settings, choose “Use Claude's published identity”. “Register automatically” doesn't work with UniHub.",
      step4: 'Connect, sign in to UniHub if asked, and allow access.',
    },
    chatgpt: {
      tab: 'ChatGPT',
      step1:
        "In ChatGPT's settings, under apps and connectors, turn on developer mode and create a connector.",
      step2: 'Paste the address above, and keep the OAuth sign-in it offers.',
      step3: 'Sign in to UniHub when it asks, and allow access.',
    },
    claudeCode: {
      tab: 'Claude Code',
      step1: 'Run this in a terminal:',
      label: 'Command',
      step2: 'Then, in Claude Code, run /mcp, pick unihub and sign in.',
    },
    other:
      "An app that can't sign in by itself takes an API key instead (below).",
  },
  apps: {
    title: 'Connected apps',
    description:
      "AI apps you allowed to read your courses. Revoking one cuts it off: it can't renew its access, and what it holds ends within the hour.",
    aria: 'Connected apps',
    loading: 'Loading your connected apps',
    connected: 'Connected {{date}}',
    empty: {
      title: 'No apps connected',
      body: 'Add UniHub to an app above, and it shows up here.',
    },
    revoke: {
      action: 'Revoke',
      aria: 'Revoke {{name}}',
      confirm: {
        title: 'Revoke {{name}}?',
        body: 'It can no longer read your courses. To use it again, connect it again.',
        action: 'Revoke access',
      },
      failed: "Couldn't revoke the app. Try again.",
    },
    notify: {
      revoked: '{{name}} is disconnected.',
    },
  },
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
