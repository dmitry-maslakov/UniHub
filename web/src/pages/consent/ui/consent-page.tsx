import { getRouteApi } from '@tanstack/react-router';
import { AnchorLink, PageTitle } from '@/shared/ui';
import { readConsentRequest } from '../lib/request';
import { ConsentRequestView } from './consent-request';

const route = getRouteApi('/_app/consent');

// Better Auth's consentPage: an app asks to read the user's courses over
// MCP. Without its signed query, there is nothing to answer.
export function ConsentPage() {
  const request = readConsentRequest(route.useSearch());
  if (!request)
    return (
      <>
        <PageTitle description="This page opens from an app that asks to connect, and the link it sent is missing or has expired. Go back to the app and connect again.">
          Nothing to approve
        </PageTitle>
        <AnchorLink to="/">Back to your courses</AnchorLink>
      </>
    );
  return <ConsentRequestView request={request} />;
}
