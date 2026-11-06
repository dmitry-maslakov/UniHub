// Where to go once signed in: a path on this site only, so a link can't
// send someone signed in on to another one. "//evil.test" is another site
// to a browser, and so are "/\evil.test" and "/<tab>/evil.test": it reads
// a backslash as a slash and drops tabs and newlines from a URL.
export function safeNext(next: unknown, fallback = '/') {
  return typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    // control characters are what it looks for
    // oxlint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f\\]/.test(next)
    ? next
    : fallback;
}
