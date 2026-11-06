import { createFileRoute } from '@tanstack/react-router';
import { CoursePage } from '@/pages/course';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/courses/$slug')({
  head: pageHead('Course'),
  component: CoursePage,
});
