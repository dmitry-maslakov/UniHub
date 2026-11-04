import { errors, type Types } from '@opensearch-project/opensearch';
import { TextIndexUnavailableError } from '../../application/ports.js';

// Which of OpenSearch's failures are an outage, worth waiting out, and which
// say the index went away.

// a node down, stuck or busy (maxRetries: 0, the client doesn't hide these)
const AWAY = new Set([429, 502, 503, 504]);
// a full disk: past the flood stage the indices are read-only (429 on a
// write) and none can be created (403)
const BLOCKS = new Set([
  'cluster_block_exception',
  'index_create_block_exception',
]);

const typeOf = (err: errors.ResponseError): string | undefined =>
  err.body?.error?.type;

const isUnavailable = (err: unknown) =>
  err instanceof errors.ConnectionError ||
  err instanceof errors.TimeoutError ||
  err instanceof errors.NoLivingConnectionsError ||
  (err instanceof errors.ResponseError &&
    (AWAY.has(err.statusCode) ||
      (err.statusCode === 403 && BLOCKS.has(typeOf(err) ?? ''))));

export const isAlreadyThere = (err: unknown) =>
  err instanceof errors.ResponseError &&
  typeOf(err) === 'resource_already_exists_exception';

// a bulk item found no index: one written to a missing unihub-* index fails
// (action.auto_create_index) rather than making it with a dynamic mapping
class IndexMissingError extends Error {}

// a new volume, or the index deleted by hand: made again, and tried once more
export const isIndexMissing = (err: unknown) =>
  err instanceof IndexMissingError ||
  (err instanceof errors.ResponseError &&
    err.statusCode === 404 &&
    typeOf(err) === 'index_not_found_exception');

// what to throw for a bulk request whose items some failed
export function bulkError(items: Types.Core_Bulk.Item[]) {
  const failed = items.flatMap((item) =>
    Object.values(item).flatMap((result) =>
      result?.error ? [{ ...result.error, status: result.status }] : [],
    ),
  );
  const why = failed
    .slice(0, 3)
    .map(({ type, reason }) => `${type}: ${reason}`)
    .join('; ');
  if (failed.some(({ type }) => type === 'index_not_found_exception'))
    return new IndexMissingError(why);
  if (failed.every(({ status }) => status === 429 || status === 503))
    return new TextIndexUnavailableError(`bulk refused: ${why}`);
  return new Error(`bulk failed: ${why}`);
}

// an outage, or an index gone again right after it was made, as
// TextIndexUnavailableError; anything else as it came
export const translated = (err: unknown) =>
  isUnavailable(err) || isIndexMissing(err)
    ? new TextIndexUnavailableError((err as Error).message, { cause: err })
    : err;
