export default {
  signIn: {
    title: 'Sign in to UniHub',
    description:
      'Your courses, their posts and files, and the AI apps that read them for you.',
    googleFailed:
      "Signing in with Google didn't finish. Try again, or use your email.",
    orEmail: 'or with your email',
    email: {
      label: 'Email',
      invalid: 'Enter the email of your account',
    },
    password: {
      label: 'Password',
      required: 'Enter your password',
    },
    forgot: 'Forgot your password?',
    action: 'Sign in',
    failed: "Couldn't sign you in. Try again.",
    newHere: 'New to UniHub?',
    createAccount: 'Create an account',
  },
  confirmFirst: {
    title: 'Confirm your email first',
    body: "Open the link we sent to {{email}}. If it's not there, we can send a new one.",
    action: 'Send a new link',
  },
  google: {
    action: 'Continue with Google',
  },
  signUp: {
    title: 'Create your account',
    description:
      'One place for the posts and files of all your courses, for you and your AI apps.',
    name: {
      label: 'Name',
      required: 'Enter your name',
    },
    email: {
      label: 'Email',
      help: "We'll send a link to confirm it.",
      invalid: 'Enter an email you can open now',
    },
    password: {
      label: 'Password',
      help: 'At least 8 characters.',
      tooShort: 'Use at least 8 characters',
      tooLong: 'Use at most 128 characters',
    },
    action: 'Create account',
    failed: "Couldn't create your account. Try again.",
    signInInstead: 'Sign in instead',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
  },
  checkEmail: {
    title: 'Check your email',
    sent: "We sent a link to <strong>{{email}}</strong>. Open it to confirm your address, and you're in.",
    sentNoEmail:
      "We sent a link to your email. Open it to confirm your address, and you're in.",
    spam: 'Nothing after a few minutes? Look in your spam folder, or ask for a new link.',
    resend: 'Send a new link',
    resent: 'New link sent',
    resendFailed: "Couldn't send a new link. Try again.",
    back: 'Back to sign in',
  },
  reset: {
    title: 'Reset your password',
    description: "We'll email you a link to choose a new one.",
    email: {
      invalid: 'Enter the email you signed up with',
    },
    expired:
      'That reset link has expired or was already used. Ask for a new one below.',
    action: 'Send reset link',
    failed: "Couldn't send the link. Try again.",
    sent: "If there's an account for <strong>{{email}}</strong>, a link to reset its password is on its way. It works for an hour.",
    back: 'Back to sign in',
  },
  newPassword: {
    title: 'Choose a new password',
    description: 'Every sign-in ends, and your API keys stop working.',
    label: 'New password',
    help: 'At least 8 characters.',
    confirm: 'New password again',
    mismatch: "The passwords don't match",
    action: 'Change password',
    failed: "Couldn't change your password. Try again.",
    notify: {
      title: 'Password changed',
      body: 'Sign in with your new password.',
    },
  },
  signInAgain: {
    title: 'Sign in again to continue',
    action: 'Sign in again',
  },
  error: {
    INVALID_EMAIL_OR_PASSWORD:
      "That email and password don't match an account. Check both and try again.",
    USER_ALREADY_EXISTS: 'There is already an account with this email.',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
      'There is already an account with this email.',
    INVALID_TOKEN: 'This link has expired or was already used.',
    PASSWORD_TOO_SHORT: 'Use at least 8 characters.',
    PASSWORD_TOO_LONG: 'Use at most 128 characters.',
    INVALID_PASSWORD: "That's not your current password.",
    tooMany: 'Too many tries in a short time. Wait a minute, then try again.',
  },
};
