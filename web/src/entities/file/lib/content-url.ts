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

// The address of a file as a picture: an image, or one page of a PDF
// (from 1), the file's or a member's
export function viewUrl(
  fileId: string,
  { page, member }: { page?: number; member?: string } = {},
) {
  const query = new URLSearchParams();
  if (page !== undefined) query.set('page', String(page));
  if (member !== undefined) query.set('member', member);
  const text = query.toString().replaceAll('+', '%20');
  return `/api/files/${fileId}/view${text && `?${text}`}`;
}

const VIEW_BY_TYPE = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
} as const;
const VIEW_BY_EXTENSION = {
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
} as const;

type Lookup = Record<string, 'image' | 'pdf'>;

// What the hub can show of a file as a picture, as its viewKind has it: an
// image, or a PDF by the page; by media type, else by extension; never SVG
export function viewKind(mime: string | null, name: string) {
  const essence = mime?.split(';')[0]!.trim().toLowerCase() ?? '';
  const byType = (VIEW_BY_TYPE as Lookup)[essence];
  if (byType) return byType;
  if (essence.includes('svg')) return null;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return (
    (VIEW_BY_EXTENSION as Lookup)[name.slice(dot + 1).toLowerCase()] ?? null
  );
}

export const viewable = (mime: string | null, name: string) =>
  viewKind(mime, name) !== null;
