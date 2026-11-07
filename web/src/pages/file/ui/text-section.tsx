import { SegmentedControl } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Schemas } from '@/shared/api';
import { EmptyState, Section } from '@/shared/ui';
import { pickText } from '../lib/text-choice';
import { TextReader } from './text-reader';

const route = getRouteApi('/_app/courses/$slug/files/$fileId');

// A file's extracted text, one part at a time. Which text, when processors
// made several, and which part, are in the address.
export function TextSection({
  file,
  member,
}: {
  file: Schemas['FileDetailsResponse'];
  member?: string;
}) {
  const { t } = useTranslation('file');
  const { processor } = route.useSearch();
  const navigate = route.useNavigate();

  if (!file.hasContent)
    return (
      <EmptyState title={t('noContent.title')}>
        {t('noContent.body')}
      </EmptyState>
    );
  if (member === undefined && !file.texts.length)
    return (
      <EmptyState title={t('noText.title')}>{t('noText.body')}</EmptyState>
    );

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
      <TextReader file={file} member={member} processor={chosen} />
    </Section>
  );
}
