import type { Kind } from './parts.js';

// What plain-text takes, by extension and media type, and how each is split.
// Listed by hand: the lists of code's extensions there are take in what
// isn't text (.res, .frm); a video's .ts is binary, so it makes no parts.
// html, rtf and epub are office-text's.

const CODE =
  '.c .h .cpp .cc .hpp .cs .java .kt .scala .py .r .m .js .mjs .jsx .ts .tsx ' +
  '.php .rb .go .rs .swift .hs .lua .pl .sql .vhd .vhdl .v .sv .asm .s .sh ' +
  '.bat .ps1 .css';

const TEXT =
  '.txt .rst .log .tex .bib .srt .vtt .csv .tsv .json .xml .yaml .yml .toml ' +
  '.ini .cfg .conf';

const MEDIA_TYPES =
  'text/plain text/csv text/tab-separated-values text/vtt ' +
  'application/x-subrip application/x-tex application/json application/xml ' +
  'text/xml application/yaml application/toml application/sql ' +
  'text/javascript text/css text/x-c text/x-java-source text/x-python ' +
  'text/x-sh';

export const KIND: Record<string, Kind> = {
  ...Object.fromEntries(
    [CODE, TEXT, MEDIA_TYPES]
      .flatMap((list) => list.split(' '))
      .map((entry): [string, Kind] => [entry, 'lines']),
  ),
  '.md': 'markdown',
  '.markdown': 'markdown',
  'text/markdown': 'markdown',
  '.ipynb': 'notebook',
  'application/x-ipynb+json': 'notebook',
};

// Past these a file is skipped, not cut: no part could say the text goes on.
// A notebook's pictures make it larger than the text it has.
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_NOTEBOOK_BYTES = 64 * 1024 * 1024;
export const maxBytes = (kind: Kind) =>
  kind === 'notebook' ? MAX_NOTEBOOK_BYTES : MAX_BYTES;

// a library's minified code (jquery.min.js, bootstrap.min.css) would turn up
// in every course whose projects have it
export const MINIFIED = /\.min\.(m?js|css)$/i;

// What archive-text takes, and how each is unpacked: a tgz is a tar in a
// gzip, and a .gz holds a tar when its name ends in .tar.gz, one file
// otherwise. By extension only: a portal calls documents built on a zip
// (docx, epub) application/zip too, and archive-text's name comes before
// office-text's, so it would be the one a page is read from.
export type ArchiveFormat = 'zip' | 'tar' | 'tgz' | 'gzip';

export const ARCHIVE: Record<string, ArchiveFormat> = {
  '.zip': 'zip',
  '.tar': 'tar',
  '.tgz': 'tgz',
  '.gz': 'gzip',
};
