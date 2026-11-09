import { Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { fileType, viewKind, viewUrl } from '@/entities/file';
import { api } from '@/shared/api';
import {
  AnchorLink,
  NotFoundState,
  PageTitle,
  QueryState,
  TextSkeleton,
} from '@/shared/ui';
import { archiveMembersQuery, memberName } from '@/widgets/archive-members';
import { FileActions } from './file-actions';
import { FileMeta } from './file-meta';
import { MembersSection } from './members-section';
import { TextSection } from './text-section';
import { ViewImage } from './view-image';

const route = getRouteApi('/_app/courses/$slug/files/$fileId');

// A file read in UniHub: what it is, how to open the original, its text
// part by part, and for an archive the files inside it. A member of an
// archive is the same page for that member.
export function FilePage() {
  const { t } = useTranslation('file');
  const { slug, fileId } = route.useParams();
  const { member, q, course } = route.useSearch();
  const file = api.useQuery('get', '/api/files/{id}', {
    params: { path: { id: fileId } },
  });

  const archive =
    file.data !== undefined &&
    !member &&
    fileType(file.data.mime, file.data.name) === 'archive';
  // an archive that holds any is read through them first
  const members = useQuery({
    ...archiveMembersQuery(fileId),
    enabled: archive,
  });
  // so far as it is loading, it may
  const hasMembers =
    archive && (members.isPending || !!members.data?.members.length);

  return (
    <QueryState
      query={file}
      loading={<TextSkeleton lines={3} label={t('loading')} />}
      notFound={
        <NotFoundState
          title={t('notFound.title')}
          description={t('notFound.description')}
          back={
            <AnchorLink to="/courses/$slug" params={{ slug }}>
              {t('notFound.back')}
            </AnchorLink>
          }
        />
      }
    >
      {(found) => (
        <>
          <PageTitle
            description={<FileMeta file={found} slug={slug} member={member} />}
          >
            {member ? memberName(member) : found.name}
          </PageTitle>
          {q && (
            <AnchorLink
              to="/search"
              search={{ q, course }}
              size="sm"
              display="block"
              mb="lg"
            >
              {t('backToResults')}
            </AnchorLink>
          )}
          <Stack gap="xxl">
            <FileActions file={found} slug={slug} member={member} />
            {archive && <MembersSection fileId={fileId} slug={slug} />}
            {found.hasContent &&
              viewKind(member ? null : found.mime, member ?? found.name) ===
                'image' && (
                <ViewImage
                  src={viewUrl(fileId, { member })}
                  alt={member ? memberName(member) : found.name}
                />
              )}
            <TextSection file={found} member={member} hasMembers={hasMembers} />
          </Stack>
        </>
      )}
    </QueryState>
  );
}
