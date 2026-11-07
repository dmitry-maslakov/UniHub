import { useTranslation } from 'react-i18next';
import { fileType } from '@/entities/file';
import { api } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { Row, RowLink, RowList, RowText, Section } from '@/shared/ui';

// The files that came with a post, each opening its page. Nothing while
// they load, when they fail, or when there are none: the post reads well
// without them.
export function Attachments({
  slug,
  itemId,
}: {
  slug: string;
  itemId: string;
}) {
  const { t } = useTranslation(['post', 'file', 'common']);
  const { size } = useFormat();
  const files = api.useQuery('get', '/api/courses/{slug}/files', {
    params: { path: { slug }, query: { item: itemId, limit: 200 } },
  });
  if (!files.data?.length) return null;
  return (
    <Section title={t('attachments.title')}>
      <RowList label={t('attachments.aria')}>
        {files.data.map((file) => (
          <Row key={file.id}>
            <RowLink
              to="/courses/$slug/files/$fileId"
              params={{ slug, fileId: file.id }}
            >
              <RowText
                title={file.name}
                meta={[
                  t(`file:type.${fileType(file.mime, file.name)}`),
                  size(file.size),
                  !file.hasContent && t('common:state.notAvailableYet'),
                ]}
              />
            </RowLink>
          </Row>
        ))}
      </RowList>
    </Section>
  );
}
