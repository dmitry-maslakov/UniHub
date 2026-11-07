import type { ReactNode } from 'react';
import { PageTitle } from '../page-title';

// A page for something that isn't there: why, and one way back
export function NotFoundState({
  title,
  description,
  back,
}: {
  title: ReactNode;
  description: ReactNode;
  back: ReactNode;
}) {
  return (
    <>
      <PageTitle description={description}>{title}</PageTitle>
      {back}
    </>
  );
}
