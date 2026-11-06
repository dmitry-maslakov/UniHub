import { Loader, Stack, Text } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { api } from '@/shared/api';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { FilesSection } from './files-section';
import { ItemsSection } from './items-section';

const route = getRouteApi('/_app/courses/$slug');

// A course's posts and files. Its name comes from the list, which also says
// whether the user may read it at all.
export function CoursePage() {
  const { slug } = route.useParams();
  const courses = api.useQuery('get', '/api/courses');
  const course = courses.data?.find((c) => c.slug === slug);

  if (courses.isPending) return <Loader size="sm" aria-label="Loading" />;
  if (courses.isError)
    return (
      <Text c="red" role="alert">
        Couldn't load this course. Reload the page to try again.
      </Text>
    );
  if (!course)
    return (
      <>
        <PageTitle description="It may have been removed, or it isn't one of yours.">
          Course not found
        </PageTitle>
        <AnchorLink to="/courses">Back to your courses</AnchorLink>
      </>
    );

  return (
    <>
      <PageTitle
        description={
          [...new Set(course.portalCourses.map((p) => p.portal))].join(' · ') ||
          undefined
        }
      >
        {course.name}
      </PageTitle>
      <Stack gap="xxl">
        <ItemsSection slug={slug} />
        <FilesSection slug={slug} />
      </Stack>
    </>
  );
}
