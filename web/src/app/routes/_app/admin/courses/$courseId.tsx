import { createFileRoute } from '@tanstack/react-router';
import { CoursePage } from '@/pages/admin/courses';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/admin/courses/$courseId')({
  head: pageHead(() => i18n.t('admin:tabs.courses')),
  component: CoursePage,
});
