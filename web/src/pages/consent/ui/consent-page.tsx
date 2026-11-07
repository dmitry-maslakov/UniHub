import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AnchorLink, NotFoundState } from '@/shared/ui';
import { readConsentRequest } from '../lib/request';
import { ConsentRequestView } from './consent-request';

const route = getRouteApi('/_app/consent');

// Better Auth's consentPage: an app asks to read the user's courses over
// MCP. Without its signed query, there is nothing to answer.
export function ConsentPage() {
  const { t } = useTranslation('consent');
  const request = readConsentRequest(route.useSearch());
  if (!request)
    return (
      <>
        <NotFoundState
          title={t('missing.title')}
          description={t('missing.description')}
          back={<AnchorLink to="/">{t('missing.back')}</AnchorLink>}
        />
      </>
    );
  return <ConsentRequestView request={request} />;
}
