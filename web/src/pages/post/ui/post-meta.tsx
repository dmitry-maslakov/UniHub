import { Fragment } from 'react';
import { useCourseName, useKindLabel } from '@/entities/course';
import { usePortalLabel } from '@/entities/source';
import type { Schemas } from '@/shared/api';
import { useFormat } from '@/shared/i18n';
import { AnchorLink } from '@/shared/ui';

// What a post is, in one line: its course (a link back), its kind, when it
// was posted, and where from. It sits in the page title's own line.
export function PostMeta({
  item,
  slug,
}: {
  item: Schemas['ItemResponse'];
  slug: string;
}) {
  const courseName = useCourseName(slug);
  const kind = useKindLabel();
  const portal = usePortalLabel();
  const { dateTime } = useFormat();
  const parts = [
    <AnchorLink key="course" to="/courses/$slug" params={{ slug }} inherit>
      {courseName}
    </AnchorLink>,
    kind(item.kind),
    dateTime(item.publishedAt),
    portal(item.portal),
  ].filter(Boolean);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      {part}
    </Fragment>
  ));
}
