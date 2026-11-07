import { Stack } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SourceBadge } from '@/entities/source';
import {
  AnchorLink,
  EmptyState,
  ListSkeleton,
  PageTitle,
  QueryState,
  RowLink,
  RowList,
  Row,
  RowText,
  Section,
} from '@/shared/ui';
import { SourceCards } from '@/widgets/sources';
import { useMyCourses } from '../model/use-my-courses';
import { FirstSyncState } from './first-sync-state';

const byName = new Intl.Collator('und', { numeric: true });

// the years a course's portal courses are for, oldest first
const yearsOf = (portalCourses: { year: number | null }[]) =>
  [...new Set(portalCourses.flatMap(({ year }) => year ?? []))]
    .sort((a, b) => a - b)
    .join(' · ');

// The courses the user reads, one list by name whatever they come from,
// each with its sources. A first visit with none shows where to add some,
// and keeps showing it as the first ones come in; with none while an
// account just linked is read for the first time, that it is, in their
// place.
export function MyCoursesPage() {
  const { t } = useTranslation('courses');
  const { courses, syncing } = useMyCourses();
  // whether the first answer of this visit had none: React's way to keep
  // what an earlier render found
  const [firstVisit, setFirstVisit] = useState<boolean>();
  if (courses.data && firstVisit === undefined)
    setFirstVisit(courses.data.length === 0);

  return (
    <>
      <PageTitle
        description={
          courses.data?.length === 0 && !syncing
            ? t('list.descriptionEmpty')
            : t('list.description')
        }
      >
        {t('list.title')}
      </PageTitle>
      <Stack gap="xxl">
        <QueryState
          query={courses}
          loading={<ListSkeleton rows={4} label={t('list.loading')} />}
          isEmpty={(data) => !data.length}
          empty={
            syncing ? (
              <FirstSyncState label={syncing.label} />
            ) : firstVisit ? null : (
              <EmptyState
                title={t('list.empty.title')}
                action={
                  <AnchorLink to="/sources">
                    {t('list.empty.action')}
                  </AnchorLink>
                }
              >
                {t('list.empty.body')}
              </EmptyState>
            )
          }
        >
          {(data) => (
            <RowList label={t('list.aria')}>
              {data
                .toSorted((a, b) => byName.compare(a.name, b.name))
                .map((course) => (
                  <Row key={course.slug}>
                    <RowLink to="/courses/$slug" params={{ slug: course.slug }}>
                      <RowText
                        title={course.name}
                        badges={course.sources.map((portal) => (
                          <SourceBadge key={portal} portal={portal} />
                        ))}
                        meta={[
                          yearsOf(course.portalCourses) || null,
                          !course.sources.length && t('list.noSource'),
                        ]}
                      />
                    </RowLink>
                  </Row>
                ))}
            </RowList>
          )}
        </QueryState>
        {firstVisit && !(syncing && courses.data?.length === 0) && (
          <Section title={t('list.addSource.title')}>
            <SourceCards order={3} />
          </Section>
        )}
      </Stack>
    </>
  );
}
