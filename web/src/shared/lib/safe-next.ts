// Where to go once signed in: a path on this site only, so a link can't
// send someone signed in on to another one ("//evil.test" and "/\evil.test"
// are other sites to a browser)
export function safeNext(next: unknown, fallback = '/') {
  return typeof next === 'string' && /^\/(?![/\\])/.test(next)
    ? next
    : fallback;
}
