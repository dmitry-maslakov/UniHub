import { Progress, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { courseProcessingQuery } from '../api/processing';

// While the hub is still reading the course's files: how many are ready,
// and that the pictures of the rest come later. Nothing when nothing waits.
export function ProcessingNote({ slug }: { slug: string }) {
  const { t } = useTranslation('courses');
  const { data } = useQuery(courseProcessingQuery(slug));
  if (!data || !(data.waiting.text || data.waiting.pictures)) return null;
  const { done, total } = data;
  return (
    <Stack gap={6} maw="60ch">
      <Text size="sm" c="dimmed">
        {t('course.processing.progress', { done, total })}
      </Text>
      <Progress
        size={4}
        value={total ? (done / total) * 100 : 0}
        aria-label={t('course.processing.progress', { done, total })}
      />
      {!data.waiting.text && (
        <Text size="xs" c="dimmed" opacity={0.7}>
          {t('course.processing.picturesLater')}
        </Text>
      )}
    </Stack>
  );
}
