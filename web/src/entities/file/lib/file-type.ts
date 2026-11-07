export type FileType =
  | 'pdf'
  | 'slides'
  | 'document'
  | 'spreadsheet'
  | 'archive'
  | 'image'
  | 'text'
  | 'code'
  | 'other';

const BY_MIME: [FileType, RegExp][] = [
  ['pdf', /^application\/pdf$/],
  [
    'slides',
    /presentationml|^application\/vnd\.ms-powerpoint$|opendocument\.presentation/,
  ],
  [
    'document',
    /wordprocessingml|^application\/msword$|opendocument\.text$|^application\/rtf$/,
  ],
  [
    'spreadsheet',
    /spreadsheetml|^application\/vnd\.ms-excel$|opendocument\.spreadsheet|^text\/csv$/,
  ],
  ['archive', /^application\/(zip|x-tar|gzip|x-7z-compressed|vnd\.rar)$/],
  ['image', /^image\//],
];

const BY_EXTENSION: Record<string, FileType> = {};
const extensions: Record<Exclude<FileType, 'image' | 'other'>, string> = {
  pdf: 'pdf',
  slides: 'ppt pptx odp key',
  document: 'doc docx odt rtf',
  spreadsheet: 'xls xlsx ods csv',
  archive: 'zip tar gz tgz 7z rar',
  code: 'c h cpp hpp java py js ts go rs cs kt sql sh asm s',
  text: 'txt md',
};
for (const [type, list] of Object.entries(extensions))
  for (const extension of list.split(' '))
    BY_EXTENSION[extension] = type as FileType;

// A file's kind, by its media type, else by its name's extension. A
// text/* type that no extension names better is text.
export function fileType(mime: string | null, name: string): FileType {
  const essence = mime?.split(';')[0]!.trim().toLowerCase() ?? '';
  const byMime = BY_MIME.find(([, pattern]) => pattern.test(essence));
  if (byMime) return byMime[0];
  const dot = name.lastIndexOf('.');
  const byName =
    dot > 0 ? BY_EXTENSION[name.slice(dot + 1).toLowerCase()] : undefined;
  if (byName) return byName;
  return essence.startsWith('text/') ? 'text' : 'other';
}
