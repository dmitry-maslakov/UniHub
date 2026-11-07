import { Anchor, Box, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useCourseNames, useKindLabel } from '@/entities/course';
import type { Schemas } from '@/shared/api';
import { AnchorLink, Row, RowText } from '@/shared/ui';
import { Snippet } from './snippet';

type Result = Schemas['FileResultResponse'] | Schemas['PostResultResponse'];

// One hit: a post, a file or a member of an archive, with where it is
export function ResultRow({ result }: { result: Result }) {
  const { t } = useTranslation('search');
  const courseName = useCourseNames();
  const kind = useKindLabel();
  const course = courseName(result.course);

  if (result.type === 'post')
    return (
      <Row>
        <Box miw={0} style={{ flex: '1 1 100%' }}>
          <RowText title={result.title ?? kind(result.kind)} />
          <Box mt={4}>
            <Snippet snippet={result.snippet} />
          </Box>
          <Group gap="md" mt="xs">
            <AnchorLink
              to="/courses/$slug"
              params={{ slug: result.course }}
              hash={`item-${result.itemId}`}
              size="sm"
            >
              {t('result.openPost')}
            </AnchorLink>
            <Text size="sm" c="dimmed">
              {t('result.postIn', { course })}
            </Text>
          </Group>
        </Box>
      </Row>
    );

  const first = result.pages[0];
  const content = `/api/files/${result.fileId}/content${
    result.member ? `?member=${encodeURIComponent(result.member)}` : ''
  }`;
  return (
    <Row>
      <Box miw={0} style={{ flex: '1 1 100%' }}>
        <RowText
          title={result.member ?? result.name}
          meta={[
            result.member && t('result.inArchive', { archive: result.name }),
          ]}
        />
        <Box mt={4}>
          {first ? (
            <Snippet snippet={first.snippet} />
          ) : (
            result.matchedName && <Snippet snippet={result.matchedName} />
          )}
        </Box>
        <Group gap="md" mt="xs">
          <Anchor href={content} size="sm">
            {t('result.download')}
          </Anchor>
          <AnchorLink
            to="/courses/$slug"
            params={{ slug: result.course }}
            hash={`file-${result.fileId}`}
            size="sm"
          >
            {t('result.inCourse')}
          </AnchorLink>
          <Text size="sm" c="dimmed">
            {course}
            {first && ` · ${t('result.page', { n: first.page })}`}
          </Text>
        </Group>
      </Box>
    </Row>
  );
}
