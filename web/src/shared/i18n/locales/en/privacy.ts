export default {
  title: 'Privacy policy',
  updated: 'Last updated {{date}}',
  who: {
    title: 'Who runs it',
    body: 'UniHub at {{site}} is run by an individual student developer. Questions about your data go to <mail>{{contact}}</mail>.',
  },
  stored: {
    title: 'What we store, and why',
    intro: 'Your account, so you can sign in and use the hub:',
    items: {
      email: 'your email and name;',
      password: 'a password hash, or a link to your Google sign-in;',
      sessions:
        'your sessions, with the IP address and browser (user agent) each was made from;',
      keys: 'your API keys, stored hashed;',
      consents: 'consents and tokens for the AI apps you connect.',
    },
    tokens:
      'Portal tokens you link are encrypted at rest. They are write-only: you can replace or remove one, but nothing shows it back.',
    content:
      "Course content fetched from learning portals with your own token, or with the operator's: posts, files, the text extracted from them and the search index built on it. You see only your own view of it.",
  },
  google: {
    title: 'Google sign-in',
    body: 'Signing in with Google reads only your basic profile and email (the openid, email and profile scopes). Nothing else is requested from Google, and Google data is used for nothing but signing you in.',
  },
  sharing: {
    title: 'Sharing',
    intro:
      "We don't sell data, show ads, or use third-party analytics or trackers. Three kinds of processors are involved:",
    items: {
      mail: 'Resend delivers our emails;',
      traffic: 'Cloudflare carries the traffic;',
      apps: 'the AI apps you choose to connect get read-only access to what you can read, and nothing more.',
    },
  },
  keeping: {
    title: 'Keeping and deleting your data',
    body: "When your account is deleted, your sessions, API keys, linked portal accounts and tokens, and your connected apps' consents and tokens are deleted with it, and so is what your linked portal accounts brought in that no other account can see. Course content that other accounts can also see stays while they do. You can delete your account yourself under Account, or write to <mail>{{contact}}</mail>.",
  },
  security: {
    title: 'Security',
    body: 'The hub is served over HTTPS only. Portal tokens are encrypted, and API keys are stored hashed.',
  },
  changes: {
    title: 'Changes',
    body: 'If this policy changes, this page changes, and the date at the top with it.',
  },
};
