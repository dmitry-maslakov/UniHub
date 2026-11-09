import { Progress, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { courseProcessingQuery } from '../api/processing';

// While the hub is still reading the course's files: first how many have
// their text ready, then, the text done, how many have their pictures read.
// Nothing when nothing waits.
export function ProcessingNote({ slug }: { slug: string }) {
  const { t } = useTranslation('courses');
  const { data } = useQuery(courseProcessingQuery(slug));
  if (!data || !(data.waiting.text || data.waiting.pictures)) return null;
  const { total, waiting } = data;
  const stage = waiting.text ? 'text' : 'pictures';
  const done = total - waiting[stage];
  const line = t(`course.processing.${stage}`, { done, count: total });
  return (
    <Stack gap={6} maw="60ch">
      <Text size="sm" c="dimmed">
        {line}
      </Text>
      <Progress
        size={4}
        value={total ? (done / total) * 100 : 0}
        aria-label={line}
      />
    </Stack>
  );
}
