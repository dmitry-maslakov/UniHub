import { Stack } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  EmptyState,
  ListSkeleton,
  QueryState,
  Row,
  RowLink,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { AdminHeader } from '@/widgets/admin-header';
import { hubCoursesQuery } from '../api/hub-courses';
import { CreateCourseForm } from './create-course-form';
import { ProcessingSection } from './processing-section';

// The courses admins made, and a form for a new one
export function CoursesPage() {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const courses = useQuery(hubCoursesQuery());
  return (
    <>
      <AdminHeader current="courses" />
      <Stack gap="xxl">
        <Section
          title={t('courses.new.title')}
          description={t('courses.new.description')}
        >
          <CreateCourseForm />
        </Section>
        <Section title={t('courses.list.title')}>
          <QueryState
            query={courses}
            loading={<ListSkeleton rows={4} label={common('state.loading')} />}
            isEmpty={(data) => !data.length}
            empty={
              <EmptyState title={t('courses.list.empty.title')}>
                {t('courses.list.empty.body')}
              </EmptyState>
            }
          >
            {(data) => (
              <RowList label={t('courses.list.aria')}>
                {data.map((course) => (
                  <Row key={course.id}>
                    <RowLink
                      to="/admin/courses/$courseId"
                      params={{ courseId: course.id }}
                    >
                      <RowText
                        title={course.name}
                        meta={[
                          `/courses/${course.slug}`,
                          t('courses.list.links', {
                            count: course.links.length,
                          }),
                          t('courses.list.readers', { count: course.readers }),
                        ]}
                      />
                    </RowLink>
                  </Row>
                ))}
              </RowList>
            )}
          </QueryState>
        </Section>
        <ProcessingSection />
      </Stack>
    </>
  );
}
