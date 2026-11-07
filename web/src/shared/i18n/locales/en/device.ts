export default {
  title: 'Sign in on another screen',
  description:
    'Approve a computer or TV that shows a sign-in code, without typing your password on it.',
  form: {
    label: 'Code on the screen',
    invalid: 'Enter the code the screen shows',
    action: 'Continue',
  },
  lookingUp: 'Looking up the code',
  expired: 'That code has expired. Start again on the screen to get a new one.',
  unknown:
    "That code isn't one we know. Check it against the screen and enter it again.",
  asks: '{{app}} wants to sign in as <strong>{{email}}</strong>.',
  codeAria: 'Code {{spelled}}',
  warning:
    'Approve only if this code is on a screen in front of you right now. If someone sent you this code, deny it: approving would let them into your account.',
  approve: {
    title: 'Approve a sign-in',
    description: 'A screen asks to sign in to UniHub with your account.',
    action: 'Approve',
  },
  deny: 'Deny',
  failed: "Couldn't send your answer. Try again.",
  freshSession:
    "To approve a screen, you need to have signed in within the last day. You'll come straight back here.",
  approved: {
    title: 'Approved',
    body: 'The screen signs in by itself in a moment. You can close this page.',
  },
  denied: {
    title: 'Denied',
    body: "The screen won't be signed in. If that was a mistake, start again on it.",
  },
  app: {
    web: 'UniHub in a browser',
    native: 'The UniHub app',
    other: 'An app',
  },
};
