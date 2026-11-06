import { Anchor, Group, Stack, Text } from '@mantine/core';
import type { Schemas } from '@/shared/api';
import { AnchorLink } from '@/shared/ui';
import classes from './search.module.css';
import { Snippet } from './snippet';

type Result = Schemas['FileResultResponse'] | Schemas['PostResultResponse'];

function courseLink(slug: string, hash: string, label: string) {
  return (
    <AnchorLink to="/courses/$slug" params={{ slug }} hash={hash} size="sm">
      {label}
    </AnchorLink>
  );
}

// One hit: a post, a file or a member of an archive, with where it is
export function ResultRow({ result }: { result: Result }) {
  if (result.type === 'post')
    return (
      <li className={classes.row}>
        <Stack gap={4}>
          <Text fw={600}>{result.title ?? result.kind}</Text>
          <Snippet snippet={result.snippet} />
          <Group gap="md">
            {courseLink(result.course, `item-${result.itemId}`, 'Open post')}
            <Text size="sm" c="dimmed">
              Post in {result.course}
            </Text>
          </Group>
        </Stack>
      </li>
    );

  const first = result.pages[0];
  const content = `/api/files/${result.fileId}/content${
    result.member ? `?member=${encodeURIComponent(result.member)}` : ''
  }`;
  return (
    <li className={classes.row}>
      <Stack gap={4}>
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {result.member ?? result.name}
        </Text>
        {result.member && (
          <Text size="sm" c="dimmed">
            In {result.name}
          </Text>
        )}
        {first ? (
          <Snippet snippet={first.snippet} />
        ) : (
          result.matchedName && <Snippet snippet={result.matchedName} />
        )}
        <Group gap="md">
          <Anchor href={content} size="sm">
            Download
          </Anchor>
          {courseLink(result.course, `file-${result.fileId}`, 'In the course')}
          <Text size="sm" c="dimmed">
            {result.course}
            {first && ` · page ${first.page}`}
          </Text>
        </Group>
      </Stack>
    </li>
  );
}
