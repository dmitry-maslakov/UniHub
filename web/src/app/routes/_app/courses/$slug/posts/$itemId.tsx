import { createFileRoute } from '@tanstack/react-router';
import { PostPage } from '@/pages/post';
import { i18n, pageHead } from '@/shared/i18n';

export const Route = createFileRoute('/_app/courses/$slug/posts/$itemId')({
  head: pageHead(() => i18n.t('post:head')),
  component: PostPage,
});
