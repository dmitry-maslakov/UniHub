// the tab a course opens on when the address names none: its files, unless
// it has none (a course site that only posts), then its posts
export const defaultTab = (fileCount: number | undefined): 'files' | 'posts' =>
  fileCount === 0 ? 'posts' : 'files';
