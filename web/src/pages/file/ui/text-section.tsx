import { SegmentedControl } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { viewKind } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { EmptyState, Section } from '@/shared/ui';
import { pickText } from '../lib/text-choice';
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

  if (!file.hasContent)
    return (
      <EmptyState title={t('noContent.title')}>
        {t('noContent.body')}
      </EmptyState>
    );
  // a picture has its own section; its text, if it has any, comes after
  const kind = viewKind(member ? null : file.mime, member ?? file.name);
  // no processor reads a picture inside an archive: its section is the picture
  if (member !== undefined && kind === 'image') return null;
  if (member === undefined && !file.texts.length) {
    if (hasMembers || kind === 'image') return null;
    return (
      <>
        <EmptyState title={t('noText.title')}>{t('noText.body')}</EmptyState>
        {kind === 'pdf' && <PageOne file={file} />}
      </>
    );
  }

  // a member has no list of texts to choose from: the one asked for, else
  // the hub's first
  const chosen =
    member === undefined
      ? pickText(file.texts, processor)?.processor
      : processor;
  return (
    <Section title={t('text.title')}>
      {member === undefined && file.texts.length > 1 && (
        <SegmentedControl
          size="sm"
          w="fit-content"
          maw="100%"
          data={file.texts.map((text) => ({
            value: text.processor,
            label: text.processor,
          }))}
          value={chosen}
          onChange={(value) =>
            void navigate({
              search: (s) => ({ ...s, processor: value, page: undefined }),
            })
          }
          aria-label={t('text.which')}
        />
      )}
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
