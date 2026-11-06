// What the archives unpacker takes, by extension only: a portal calls
// documents built on a zip (docx, epub) application/zip too, and what they're
// made of (their xml) would come out as members. A tgz is a tar in a gzip; a
// .gz holds a tar when its name less the .gz ends in .tar, one file otherwise.
export type ArchiveFormat = 'zip' | 'tar' | 'tgz' | 'gzip';

export const ARCHIVE: Record<string, ArchiveFormat> = {
  '.zip': 'zip',
  '.tar': 'tar',
  '.tgz': 'tgz',
  '.gz': 'gzip',
};
