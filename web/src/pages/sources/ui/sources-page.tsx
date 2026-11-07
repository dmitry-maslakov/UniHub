import { PageTitle } from '@/shared/ui';
import { SourceCards } from '@/widgets/sources';

export function SourcesPage() {
  return (
    <>
      <PageTitle description="Where the hub reads your courses from. Link your own account, and the hub reads the courses you follow there, as you see them; on a public site, pick the courses you follow.">
        Sources
      </PageTitle>
      <SourceCards order={2} />
    </>
  );
}
