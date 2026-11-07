import { createFileRoute } from '@tanstack/react-router';
import { MyCoursesPage } from '@/pages/my-courses';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/')({
  head: pageHead(() => i18n.t('courses:list.title')),
  component: MyCoursesPage,
});
