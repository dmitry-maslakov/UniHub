import { createFileRoute } from '@tanstack/react-router';
import { CoursePage, courseSearch } from '@/pages/course';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/courses/$slug/')({
  validateSearch: courseSearch,
  head: pageHead(() => i18n.t('courses:course.head')),
  component: CoursePage,
});
