import {
  IconFile,
  IconFileCode,
  IconFileText,
  IconFileTypePdf,
  IconFileZip,
  IconPhoto,
  IconPresentation,
  IconTable,
} from '@tabler/icons-react';
import type { FileType } from '../lib/file-type';

const ICONS = {
  pdf: IconFileTypePdf,
  slides: IconPresentation,
  document: IconFileText,
  text: IconFileText,
  spreadsheet: IconTable,
  archive: IconFileZip,
  image: IconPhoto,
  code: IconFileCode,
  other: IconFile,
} satisfies Record<FileType, typeof IconFile>;

// A file's kind as a small dimmed icon; its name says the rest
export function FileTypeIcon({ type }: { type: FileType }) {
  const Icon = ICONS[type];
  return (
    <Icon
      size={16}
      stroke={1.75}
      color="var(--mantine-color-dimmed)"
      aria-hidden
    />
  );
}
