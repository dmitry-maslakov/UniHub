import { Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { SourceBadge } from '@/entities/source';
import { api } from '@/shared/api';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { SourceCards } from '@/widgets/sources';
import classes from './my-courses.module.css';

const byName = new Intl.Collator('und', { numeric: true });

// the years a course's portal courses are for, oldest first
const yearsOf = (portalCourses: { year: number | null }[]) =>
  [...new Set(portalCourses.flatMap(({ year }) => year ?? []))]
    .sort((a, b) => a - b)
    .join(' · ');

// The courses the user reads, one list by name whatever they come from,
// each with its sources. A first visit with none shows where to add some,
// and keeps showing it as the first ones come in.
export function MyCoursesPage() {
  const courses = api.useQuery('get', '/api/courses');
  // whether the first answer of this visit had none: React's way to keep
  // what an earlier render found
  const [firstVisit, setFirstVisit] = useState<boolean>();
  if (courses.data && firstVisit === undefined)
    setFirstVisit(courses.data.length === 0);

  return (
    <>
      <PageTitle
        description={
          courses.data && !courses.data.length
            ? 'Nothing to read yet. Link your own account of a portal, or pick courses from a public site, and they show up here.'
            : 'The courses you read here, and the same ones your AI agents read for you.'
        }
      >
        My courses
      </PageTitle>
      {courses.isPending && <Loader size="sm" aria-label="Loading courses" />}
      {courses.isError && (
        <Text c="red" role="alert">
          Couldn't load your courses. Reload the page to try again.
        </Text>
      )}
      {courses.data && !courses.data.length && firstVisit === false && (
        <AnchorLink to="/sources">Add a source</AnchorLink>
      )}
      {courses.data && courses.data.length > 0 && (
        <ul className={classes.list} aria-label="Your courses">
          {courses.data
            .toSorted((a, b) => byName.compare(a.name, b.name))
            .map((course) => (
              <li key={course.slug} className={classes.item}>
                <Link
                  to="/courses/$slug"
                  params={{ slug: course.slug }}
                  className={classes.row}
                >
                  <Stack gap={6}>
                    <Text fw={600} className={classes.name}>
                      {course.name}
                    </Text>
                    <Group gap="xs" wrap="wrap">
                      {course.sources.map((portal) => (
                        <SourceBadge key={portal} portal={portal} />
                      ))}
                      {yearsOf(course.portalCourses) && (
                        <Text size="sm" c="dimmed">
                          {yearsOf(course.portalCourses)}
                        </Text>
                      )}
                    </Group>
                  </Stack>
                </Link>
              </li>
            ))}
        </ul>
      )}
      {firstVisit && (
        <Stack
          component="section"
          gap="xs"
          mt={courses.data?.length ? 'xxl' : undefined}
          aria-labelledby="add-a-source"
        >
          <Title order={2} id="add-a-source">
            Add a source
          </Title>
          <SourceCards order={3} />
        </Stack>
      )}
    </>
  );
}
