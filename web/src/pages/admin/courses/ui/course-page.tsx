import { Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  AnchorLink,
  ListSkeleton,
  NotFoundState,
  PageTitle,
  QueryState,
} from '@/shared/ui';
import { hubCoursesQuery } from '../api/hub-courses';
import { LinksSection } from './links-section';
import { ReadersSection } from './readers-section';

const route = getRouteApi('/_app/admin/courses/$courseId');

// A course an admin made: the portal courses it gathers and who reads it. It
// is the course's entry of the list, which says whether it is there at all.
export function CoursePage() {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const { courseId } = route.useParams();
  const courses = useQuery(hubCoursesQuery());
  const back = <AnchorLink to="/admin/courses">{t('course.back')}</AnchorLink>;
  return (
    <QueryState
      query={courses}
      loading={<ListSkeleton label={common('state.loading')} />}
      isEmpty={(data) => !data.some((course) => course.id === courseId)}
      empty={
        <NotFoundState
          title={t('course.notFound.title')}
          description={t('course.notFound.description')}
          back={back}
        />
      }
    >
      {(data) => {
        const course = data.find(({ id }) => id === courseId);
        return (
          course && (
            <>
              <PageTitle
                description={
                  <>
                    {`/courses/${course.slug}`} · {back}
                  </>
                }
              >
                {course.name}
              </PageTitle>
              <Stack gap="xxl">
                <LinksSection course={course} />
                <ReadersSection course={course} />
              </Stack>
            </>
          )
        );
      }}
    </QueryState>
  );
}
