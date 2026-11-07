// what a browser shows itself, as the hub's INLINE_TYPES have it: the hub
// decides what is sent inline, this only labels the button
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
]);

export const opensInline = (mime: string | null) =>
  !!mime && INLINE_TYPES.has(mime.split(';')[0]!.trim().toLowerCase());

// The address of a file's bytes, or a member's, to follow as a link; with
// `inline` the hub shows the types a browser can instead of saving them
export function contentUrl(
  fileId: string,
  { member, inline }: { member?: string; inline?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (member !== undefined) query.set('member', member);
  if (inline) query.set('disposition', 'inline');
  const text = query.toString().replaceAll('+', '%20');
  return `/api/files/${fileId}/content${text && `?${text}`}`;
}
