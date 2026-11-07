export default {
  head: 'Connect an app',
  title: '{{requester}} wants to read your courses',
  named:
    'It calls itself “{{name}}”. Allow it only if that is the app you just used.',
  unnamed: 'Allow it only if this is the app you just used.',
  can: {
    title: 'It will be able to',
    read: 'Read and search your courses, posts and files (read-only)',
    stay: 'Stay connected until you change your password, or for 30 days after you last use it',
  },
  // in place of can.stay, for an app that asked for no refresh token
  hourOnly: 'Connected for an hour; then the app asks you again.',
  returnTo: "You'll return to <strong>{{host}}</strong>",
  notEncrypted: '(not encrypted)',
  loopback: {
    title: 'This sends you back to this computer',
    body: 'Only a program running on this computer gets access. Allow it only if you just started it yourself.',
  },
  allow: 'Allow',
  deny: 'Deny',
  failed:
    "That didn't go through. The request may have expired: go back to the app and connect again.",
  signedInAs: 'Signed in as {{email}}.',
  notYou: 'Not you?',
  missing: {
    title: 'Nothing to approve',
    description:
      'This page opens from an app that asks to connect, and the link it sent is missing or has expired. Go back to the app and connect again.',
    back: 'Go to My courses',
  },
};
