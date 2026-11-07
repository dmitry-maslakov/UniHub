import { Anchor, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { contentUrl } from '@/entities/file';
import { api } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import {
  Row,
  RowAction,
  RowLink,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';

const PAGE = 50;

// The files inside an archive, in the order it lists them: one with a text
// opens to read it, the others can be downloaded or say why they weren't
// kept. Nothing for a file that isn't a container.
export function MembersSection({
  fileId,
  slug,
}: {
  fileId: string;
  slug: string;
}) {
  const { t } = useTranslation('file');
  const { size } = useFormat();
  const members = api.useInfiniteQuery(
    'get',
    '/api/files/{id}/members',
    { params: { path: { id: fileId }, query: { limit: PAGE } } },
    {
      pageParamName: 'offset',
      initialPageParam: 0,
      getNextPageParam: (last, all) =>
        last.length < PAGE ? undefined : all.length * PAGE,
    },
  );
  if (!members.data?.pages[0]?.length) return null;

  return (
    <Section title={t('members.title')} description={t('members.description')}>
      <RowList label={t('members.aria')}>
        {members.data.pages.flat().map((member) => {
          const text = (
            <RowText
              title={member.path}
              meta={[
                size(member.size),
                member.leftOut
                  ? t(`members.leftOut.${member.leftOut}`)
                  : !member.texts.length && t('members.noText'),
              ]}
            />
          );
          return member.texts.length ? (
            <Row key={member.path}>
              <RowLink
                to="/courses/$slug/files/$fileId"
                params={{ slug, fileId }}
                search={{ member: member.path }}
              >
                {text}
              </RowLink>
            </Row>
          ) : (
            <Row key={member.path}>
              {text}
              {!member.leftOut && (
                <RowAction>
                  <Anchor
                    size="sm"
                    href={contentUrl(fileId, { member: member.path })}
                  >
                    {t('download')}
                  </Anchor>
                </RowAction>
              )}
            </Row>
          );
        })}
      </RowList>
      {members.hasNextPage && (
        <Button
          variant="default"
          w="fit-content"
          loading={members.isFetchingNextPage}
          onClick={() => void members.fetchNextPage()}
        >
          {t('members.more')}
        </Button>
      )}
    </Section>
  );
}
