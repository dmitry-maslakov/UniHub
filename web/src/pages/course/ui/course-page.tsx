import { Stack } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCourse } from '@/entities/course';
import {
  AnchorLink,
  ListSkeleton,
  NotFoundState,
  PageTitle,
  QueryState,
} from '@/shared/ui';
import { FilesSection } from './files-section';
import { ItemsSection } from './items-section';
import { SourcesStrip } from './sources-strip';

const route = getRouteApi('/_app/courses/$slug');

// A course's posts and files, under where they come from. Its name and
// sources come from the list, which also says whether the user may read it
// at all.
export function CoursePage() {
  const { t } = useTranslation('courses');
  const { slug } = route.useParams();
  const { query, course } = useCourse(slug);

  return (
    <QueryState
      query={query}
      loading={<ListSkeleton rows={3} label={t('list.loading')} />}
      isEmpty={() => !course}
      empty={
        <NotFoundState
          title={t('course.notFound.title')}
          description={t('course.notFound.description')}
          back={<AnchorLink to="/">{t('course.notFound.back')}</AnchorLink>}
        />
      }
    >
      {() =>
        course && (
          <>
            <PageTitle>{course.name}</PageTitle>
            <Stack gap="xxl">
              <SourcesStrip portalCourses={course.portalCourses} />
              <ItemsSection slug={slug} />
              <FilesSection slug={slug} />
            </Stack>
          </>
        )
      }
    </QueryState>
  );
}
