const CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

// redis being down for a while is worth waiting out, a bug isn't
export function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    (code !== undefined && CODES.has(code)) ||
    /connection is closed|max retries per request/i.test(error.message)
  );
}
