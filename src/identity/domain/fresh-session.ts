// What a session does that outlasts it (makes an API key, approves a
// screen's sign-in by QR, links a portal account) takes one signed in within
// this long: so an old cookie someone stole doesn't, nor does a session
// kept alive for weeks. Better Auth's freshAge, which its own routes check
// (better-auth.ts); the hub's routes check isFresh.
export const FRESH_AGE_SECONDS = 24 * 60 * 60;

// as Better Auth tells a fresh session: by when it was signed in
export const isFresh = (signedInAt: Date, now = new Date()) =>
  now.getTime() - signedInAt.getTime() < FRESH_AGE_SECONDS * 1000;
