import { Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useCourseNames, useKindLabel } from '@/entities/course';
import { partNoun } from '@/entities/file';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { Row, RowLink, RowText } from '@/shared/ui';
import { Snippet } from './snippet';

type Result = Schemas['FileResultResponse'] | Schemas['PostResultResponse'];

// One hit, a link over the whole row: a post opens its page, a file or a
// member of an archive opens at the part that matched. `q` goes along, so
// the file's page can lead back; so does `scope`, the course the search was
// limited to.
export function ResultRow({
  result,
  q,
  scope,
}: {
  result: Result;
  q: string;
  scope?: string;
}) {
  const { t } = useTranslation(['search', 'file']);
  const { date } = useFormat();
  const courseName = useCourseNames();
  const kind = useKindLabel();
  const course = courseName(result.course);

  if (result.type === 'post')
    return (
      <Row>
        <RowLink
          to="/courses/$slug/posts/$itemId"
          params={{ slug: result.course, itemId: result.itemId }}
        >
          <RowText
            title={result.title ?? kind(result.kind)}
            meta={[kind(result.kind), course, date(result.publishedAt)]}
          />
          <Box mt={4}>
            <Snippet snippet={result.snippet} />
          </Box>
        </RowLink>
      </Row>
    );

  const first = result.pages[0];
  return (
    <Row>
      <RowLink
        to="/courses/$slug/files/$fileId"
        params={{ slug: result.course, fileId: result.fileId }}
        search={{
          page: first?.page,
          processor: first?.processor,
          member: result.member ?? undefined,
          q,
          course: scope,
        }}
      >
        <RowText
          title={result.member ?? result.name}
          meta={[
            result.member && t('result.inArchive', { archive: result.name }),
            course,
            result.path || null,
            first
              ? t(`file:at.${partNoun(null, result.member ?? result.name)}`, {
                  n: first.page,
                })
              : t('result.nameMatch'),
          ]}
        />
        <Box mt={4}>
          {first ? (
            <Snippet snippet={first.snippet} />
          ) : (
            result.matchedName && <Snippet snippet={result.matchedName} />
          )}
        </Box>
      </RowLink>
    </Row>
  );
}
