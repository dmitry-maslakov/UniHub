// What can be shown as a picture: an image (never SVG, which can hold
// scripts and is text anyway), or a PDF, a page of it at a time. A deck or
// an office file isn't yet.
export type ViewKind = 'image' | 'pdf';

const BY_TYPE: Record<string, ViewKind> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};
const BY_EXTENSION: Record<string, ViewKind> = {
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
};

// by the media type's essence, else by the name's extension: a portal's type
// may be missing or a generic one
export function viewKind(mime: string | null, name: string): ViewKind | null {
  const essence = mime?.split(';')[0]!.trim().toLowerCase() ?? '';
  if (essence in BY_TYPE) return BY_TYPE[essence]!;
  if (essence.includes('svg')) return null;
  const dot = name.lastIndexOf('.');
  return dot < 0 ? null : (BY_EXTENSION[name.slice(dot).toLowerCase()] ?? null);
}

// the most of a file read to be shown: past it, it isn't
export const VIEW_LIMITS: Record<ViewKind, number> = {
  image: 32 * 1024 * 1024,
  pdf: 64 * 1024 * 1024,
};
