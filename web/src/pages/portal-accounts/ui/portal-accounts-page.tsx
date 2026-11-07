import { PageTitle } from '@/shared/ui';
import { SourceCards } from '@/widgets/sources';

export function PortalAccountsPage() {
  return (
    <>
      <PageTitle description="Link your own account of a portal, or pick courses of a public one, so the hub can read the courses you follow there. A token stays with the hub and is never shown again.">
        Portal accounts
      </PageTitle>
      <SourceCards />
    </>
  );
}
