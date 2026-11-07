import { createFileRoute } from '@tanstack/react-router';
import { MyCoursesPage } from '@/pages/my-courses';
import { pageHead } from '@/shared/lib';

export const Route = createFileRoute('/_app/')({
  head: pageHead('My courses'),
  component: MyCoursesPage,
});
