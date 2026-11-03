const CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  // prisma: can't reach the database, timed out, socket timeout, connection
  // closed, no free connection in the pool
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

// redis or postgres being down for a while is worth waiting out, a bug isn't
export function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    (code !== undefined && CODES.has(code)) ||
    /connection is closed|max retries per request/i.test(error.message)
  );
}
