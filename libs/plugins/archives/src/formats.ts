// What the archives expander takes, and how each is unpacked: a tgz is a tar
// in a gzip, and a .gz holds a tar when its name ends in .tar.gz, one file
// otherwise. By extension only: a portal calls documents built on a zip
// (docx, epub) application/zip too, and what they're made of (their xml)
// would come out as entries.
export type ArchiveFormat = 'zip' | 'tar' | 'tgz' | 'gzip';

export const ARCHIVE: Record<string, ArchiveFormat> = {
  '.zip': 'zip',
  '.tar': 'tar',
  '.tgz': 'tgz',
  '.gz': 'gzip',
};
