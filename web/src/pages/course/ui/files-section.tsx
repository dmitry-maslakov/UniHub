import { Anchor, Button, Loader, Stack, Text, Title } from '@mantine/core';
import { api } from '@/shared/api';
import { fileSize } from '../lib/format';
import { useDeepLink } from '../lib/use-deep-link';
import classes from './course.module.css';

const PAGE = 50;

// A course's files by folder and name, fifty at a time. One opens through
// the content route, which the browser saves or shows as the portal's type
// says.
export function FilesSection({ slug }: { slug: string }) {
  const files = api.useInfiniteQuery(
    'get',
    '/api/courses/{slug}/files',
    { params: { path: { slug }, query: { limit: PAGE } } },
    {
      pageParamName: 'offset',
      initialPageParam: 0,
      getNextPageParam: (last, all) =>
        last.length < PAGE ? undefined : all.length * PAGE,
    },
  );
  const rows = files.data?.pages.flat() ?? [];
  useDeepLink(
    'file-',
    rows.map((row) => row.id),
    {
      ...files,
      pages: files.data?.pages.length ?? 0,
    },
  );

  return (
    <Stack component="section" gap="xs" aria-labelledby="files">
      <Title order={2} id="files">
        Files
      </Title>
      {files.isPending && <Loader size="sm" aria-label="Loading files" />}
      {files.isError && (
        <Text c="red" role="alert">
          Couldn't load the files. Reload the page to try again.
        </Text>
      )}
      {files.data && !rows.length && (
        <Text c="dimmed">No files in this course yet.</Text>
      )}
      {rows.length > 0 && (
        <ul className={classes.list} aria-labelledby="files">
          {rows.map((file) => (
            <li key={file.id} id={`file-${file.id}`} className={classes.row}>
              <Stack gap={2} miw={0}>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {file.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {[file.path, fileSize(file.size)].filter(Boolean).join(' · ')}
                  {!file.hasContent &&
                    `${file.path || file.size !== null ? ' · ' : ''}Not available yet`}
                </Text>
              </Stack>
              {file.hasContent && (
                <Anchor
                  href={`/api/files/${file.id}/content`}
                  size="sm"
                  aria-label={`Download ${file.name}`}
                >
                  Download
                </Anchor>
              )}
            </li>
          ))}
        </ul>
      )}
      {files.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={files.isFetchingNextPage}
          onClick={() => void files.fetchNextPage()}
        >
          Show more files
        </Button>
      )}
    </Stack>
  );
}
