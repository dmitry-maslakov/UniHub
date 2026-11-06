import { createFileRoute } from '@tanstack/react-router';
import { CoursesPage } from '@/pages/courses';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/courses/')({
  head: pageHead('Courses'),
  component: CoursesPage,
});
