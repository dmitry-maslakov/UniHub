import { Loader, Stack, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { api } from '@/shared/api';
import { PageTitle } from '@/shared/ui';
import classes from './courses.module.css';

// The courses the user may read, each with the portals it comes from
export function CoursesPage() {
  const courses = api.useQuery('get', '/api/courses');
  return (
    <>
      <PageTitle description="The courses you can read here, and the same ones your AI agents read for you.">
        Courses
      </PageTitle>
      {courses.isPending && <Loader size="sm" aria-label="Loading courses" />}
      {courses.isError && (
        <Text c="red" role="alert">
          Couldn't load your courses. Reload the page to try again.
        </Text>
      )}
      {courses.data && !courses.data.length && (
        <Text c="dimmed" maw="60ch">
          No courses yet. Once you link a portal account, or an admin gives you
          a course, it shows up here.
        </Text>
      )}
      {courses.data && courses.data.length > 0 && (
        <ul className={classes.list} aria-label="Your courses">
          {courses.data.map((course) => (
            <li key={course.slug} className={classes.item}>
              <Link
                to="/courses/$slug"
                params={{ slug: course.slug }}
                className={classes.row}
              >
                <Stack gap={2}>
                  <Text fw={600} className={classes.name}>
                    {course.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {[
                      ...new Set(
                        course.portalCourses.map(
                          (p) => `${p.portal}${p.year ? ` ${p.year}` : ''}`,
                        ),
                      ),
                    ].join(' · ') || 'No portal yet'}
                  </Text>
                </Stack>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
