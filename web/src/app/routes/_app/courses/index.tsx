import { createFileRoute, redirect } from '@tanstack/react-router';

// the courses were listed here before they were the home page
export const Route = createFileRoute('/_app/courses/')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true });
  },
});
