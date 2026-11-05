const CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  // undici's (fetch's cause): the server closed the connection before it
  // answered, or nothing took it within undici's 10 s
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  // prisma: can't reach the database, timed out, socket timeout, connection
  // closed, no free connection in the pool
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

// redis, postgres or a server we call being down for a while is worth
// waiting out, a bug isn't
export function isConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    (code !== undefined && CODES.has(code)) ||
    /connection is closed|max retries per request/i.test(error.message)
  );
}

// what a server down, stuck behind its proxy or too busy answers over HTTP:
// worth waiting out too
export const AWAY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);
