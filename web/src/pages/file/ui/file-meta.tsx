import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useCourseNames } from '@/entities/course';
import { fileType } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { AnchorLink } from '@/shared/ui';
import { memberName } from '@/widgets/archive-members';

// What a file is, in one line: its course (a link back), where it sits (or
// which archive), its size and kind. It sits in the page title's own line.
export function FileMeta({
  file,
  slug,
  member,
}: {
  file: Schemas['FileDetailsResponse'];
  slug: string;
  member?: string;
}) {
  const { t } = useTranslation('file');
  const courseName = useCourseNames();
  const { size, date } = useFormat();
  const type = member
    ? fileType(null, memberName(member))
    : fileType(file.mime, file.name);
  const parts = [
    <AnchorLink key="course" to="/courses/$slug" params={{ slug }} inherit>
      {courseName(slug)}
    </AnchorLink>,
    member ? t('meta.inArchive', { archive: file.name }) : file.path || null,
    member ? null : size(file.size),
    member ? null : date(file.changedAt),
    t(`type.${type}`),
  ].filter(Boolean);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {part}
    </Fragment>
  ));
}
