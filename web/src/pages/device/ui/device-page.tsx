import { getRouteApi } from '@tanstack/react-router';
import { PageTitle } from '@/shared/ui';
import { normalizeCode } from '../lib/user-code';
import { CodeForm } from './code-form';
import { DeviceRequestView } from './device-request-view';

const route = getRouteApi('/_app/device');

// A screen signing in by QR code: approved or denied from here
export function DevicePage() {
  const { user_code } = route.useSearch();
  const code = user_code ? normalizeCode(user_code) : undefined;
  return (
    <>
      <PageTitle description="Approve a computer or TV that shows a sign-in code, without typing your password on it.">
        Sign in on another screen
      </PageTitle>
      {code ? <DeviceRequestView key={code} code={code} /> : <CodeForm />}
    </>
  );
}
