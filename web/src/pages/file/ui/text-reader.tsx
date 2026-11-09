import { Pagination, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { partNoun, viewKind, viewUrl } from '@/entities/file';
import { api, type Schemas } from '@/shared/api';
import { memberName } from '@/widgets/archive-members';
import { AnchorLink, EmptyState, QueryState, TextSkeleton } from '@/shared/ui';
import classes from './file.module.css';
import { ViewImage } from './view-image';

const route = getRouteApi('/_app/courses/$slug/files/$fileId');

// One part of a file's text: read from the hub, with the way to the others
export function TextReader({
  file,
  member,
  processor,
  asPage = false,
}: {
  file: Schemas['FileDetailsResponse'];
  member?: string;
  processor?: string;
  // a PDF's page drawn as a picture, in place of its text
  asPage?: boolean;
}) {
  const { t } = useTranslation('file');
  const { slug } = route.useParams();
  const { page = 1 } = route.useSearch();
  const navigate = route.useNavigate();
  const part = partNoun(member ? null : file.mime, member ?? file.name);
  const kind = viewKind(member ? null : file.mime, member ?? file.name);
  const text = api.useQuery('get', '/api/files/{id}/text', {
    params: { path: { id: file.id }, query: { page, processor, member } },
  });

  return (
    <QueryState
      query={text}
      loading={<TextSkeleton lines={12} label={t('text.loading')} />}
      notFound={
        <>
          <EmptyState title={t('noPage.title')}>
            <Trans
              t={t}
              i18nKey="noPage.body"
              components={{
                first: (
                  <AnchorLink
                    to="/courses/$slug/files/$fileId"
                    params={{ slug, fileId: file.id }}
                    search={(s) => ({ ...s, page: undefined })}
                    inherit
                  />
                ),
              }}
            />
          </EmptyState>
          {kind === 'pdf' && <PageOne file={file} member={member} />}
        </>
      }
    >
      {(found) => (
        <>
          {!(part === 'section' && found.pages === 1) && (
            <Text size="sm" c="dimmed" component="output" display="block">
              {t(`position.${part}`, { n: found.page, total: found.pages })}
            </Text>
          )}
          {found.processor === 'ocr' && !asPage && found.text.trim() && (
            <Text size="sm" c="dimmed">
              {t('text.recognized')}
            </Text>
          )}
          {asPage ? (
            <ViewImage
              key={`${found.page}/${member}`}
              src={viewUrl(file.id, { page: found.page, member })}
              alt={`${member ? memberName(member) : file.name}, ${t(`at.${part}`, { n: found.page })}`}
              paged
            />
          ) : found.text.trim() ? (
            <Text className={classes.text}>{found.text}</Text>
          ) : (
            <EmptyState title={t('emptyPage.title')}>
              {t('emptyPage.body')}
            </EmptyState>
          )}
          {found.pages > 1 && (
            <Pagination
              mt="md"
              total={found.pages}
              value={found.page}
              size="sm"
              siblings={1}
              boundaries={1}
              onChange={(n) =>
                void navigate({ search: (s) => ({ ...s, page: n }) })
              }
              getControlProps={(control) => ({
                'aria-label':
                  control === 'next'
                    ? t('pagination.next')
                    : t('pagination.previous'),
              })}
              getItemProps={(n) => ({
                'aria-label': t('pagination.page', { n }),
              })}
            />
          )}
        </>
      )}
    </QueryState>
  );
}

// what the text lacks, a PDF's first page, drawn by the hub
export function PageOne({
  file,
  member,
}: {
  file: Schemas['FileDetailsResponse'];
  member?: string;
}) {
  const { t } = useTranslation('file');
  return (
    <ViewImage
      src={viewUrl(file.id, { page: 1, member })}
      alt={`${member ? memberName(member) : file.name}, ${t('at.page', { n: 1 })}`}
      paged
    />
  );
}
