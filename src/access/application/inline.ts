// what a browser shows itself without running anything of the file's
export const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
]);

// a media type's essence, as a file's type says it, is one of those
export const opensInline = (mime: string | null) =>
  !!mime && INLINE_TYPES.has(mime.split(';')[0]!.trim().toLowerCase());
