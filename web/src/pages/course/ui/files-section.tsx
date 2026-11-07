import { Anchor, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { api } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import {
  EmptyState,
  ListSkeleton,
  QueryState,
  Row,
  RowAction,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { useDeepLink } from '../lib/use-deep-link';

const PAGE = 50;

// A course's files by folder and name, fifty at a time. One opens through
// the content route, which the browser saves or shows as the portal's type
// says.
export function FilesSection({ slug }: { slug: string }) {
  const { t } = useTranslation(['courses', 'common']);
  const { size } = useFormat();
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
    <Section title={t('files.title')} id="files">
      <QueryState
        query={files}
        loading={<ListSkeleton label={t('files.loading')} />}
        isEmpty={() => !rows.length}
        empty={
          <EmptyState title={t('files.empty.title')}>
            {t('files.empty.body')}
          </EmptyState>
        }
      >
        {() => (
          <RowList label={t('files.title')}>
            {rows.map((file) => (
              <Row key={file.id} id={`file-${file.id}`}>
                <RowText
                  title={file.name}
                  meta={[
                    file.path,
                    size(file.size),
                    !file.hasContent && t('common:state.notAvailableYet'),
                  ]}
                />
                {file.hasContent && (
                  <RowAction>
                    <Anchor
                      href={`/api/files/${file.id}/content`}
                      size="sm"
                      aria-label={t('files.downloadAria', { name: file.name })}
                    >
                      {t('files.download')}
                    </Anchor>
                  </RowAction>
                )}
              </Row>
            ))}
          </RowList>
        )}
      </QueryState>
      {files.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={files.isFetchingNextPage}
          onClick={() => void files.fetchNextPage()}
        >
          {t('files.more')}
        </Button>
      )}
    </Section>
  );
}
