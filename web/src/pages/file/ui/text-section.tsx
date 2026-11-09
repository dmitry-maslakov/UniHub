import { SegmentedControl } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { viewKind } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { EmptyState, Section } from '@/shared/ui';
import { archiveMembersQuery } from '@/widgets/archive-members';
import { chosenText } from '../lib/text-choice';
import { PageOne, TextReader } from './text-reader';

const route = getRouteApi('/_app/courses/$slug/files/$fileId');

// A file's extracted text, one part at a time. Which text, when processors
// made several, and which part, are in the address.
export function TextSection({
  file,
  member,
  hasMembers = false,
}: {
  file: Schemas['FileDetailsResponse'];
  member?: string;
  // an archive with files inside (or still loading them) is read through
  // them, not told it has no text
  hasMembers?: boolean;
}) {
  const { t } = useTranslation('file');
  const { processor, show } = route.useSearch();
  const navigate = route.useNavigate();
  // a picture has its own section; its text, if it has any, comes after
  const kind = viewKind(member ? null : file.mime, member ?? file.name);
  // A picture inside an archive has a text only if the archive's list says
  // so (the file's own texts are the archive's, not the member's)
  const memberPicture = member !== undefined && kind === 'image';
  const members = useQuery({
    ...archiveMembersQuery(file.id),
    enabled: memberPicture,
  });

  if (!file.hasContent)
    return (
      <EmptyState title={t('noContent.title')}>
        {t('noContent.body')}
      </EmptyState>
    );
  if (
    memberPicture &&
    !members.data?.members.find((m) => m.path === member)?.texts.length
  )
    return null;
  if (member === undefined && !file.texts.length) {
    if (hasMembers || kind === 'image') return null;
    return (
      <>
        <EmptyState title={t('noText.title')}>{t('noText.body')}</EmptyState>
        {kind === 'pdf' && <PageOne file={file} />}
      </>
    );
  }

  // the text the address names; a member has no list to check it against
  const chosen =
    member === undefined ? chosenText(file.texts, processor) : processor;
  return (
    <Section title={t('text.title')}>
      {kind === 'pdf' && (
        <SegmentedControl
          size="sm"
          w="fit-content"
          maw="100%"
          data={[
            { value: 'text', label: t('view.text') },
            { value: 'page', label: t('view.page') },
          ]}
          value={show ?? 'text'}
          onChange={(value) =>
            void navigate({
              search: (s) => ({
                ...s,
                show: value === 'page' ? 'page' : undefined,
              }),
            })
          }
          aria-label={t('view.which')}
        />
      )}
      <TextReader
        file={file}
        member={member}
        processor={chosen}
        asPage={kind === 'pdf' && show === 'page'}
      />
    </Section>
  );
}
