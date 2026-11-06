import { Alert, Button, Group, Stack } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { isSessionNotFresh } from '@/features/sign-in-again';
import { leaveTo, parseSearch } from '@/shared/lib';
import { answerConsent } from '../api/consent';

// Allow or Deny. Both go to Better Auth and then, as one page to another
// (the page has no form to post), to the address it returns. A session too
// old to consent goes to sign in again with the same signed query, and
// comes back to this page by Better Auth's own redirect.
export function ConsentDecision() {
  const { searchStr } = useLocation();
  const navigate = useNavigate();
  const answer = useMutation({
    mutationFn: (accept: boolean) =>
      answerConsent(accept, searchStr.replace(/^\?/, '')),
    onSuccess: (url) => leaveTo(url),
    onError: (error) => {
      if (isSessionNotFresh(error))
        void navigate({ to: '/sign-in', search: parseSearch(searchStr) });
    },
  });
  const busy = answer.isPending || answer.isSuccess;

  return (
    <Stack gap="md">
      {answer.isError && !isSessionNotFresh(answer.error) && (
        <Alert color="red" role="alert">
          That didn't go through. The request may have expired: go back to the
          app and connect again.
        </Alert>
      )}
      <Group gap="sm">
        <Button
          loading={busy && answer.variables}
          disabled={busy}
          onClick={() => answer.mutate(true)}
        >
          Allow
        </Button>
        <Button
          variant="default"
          loading={busy && !answer.variables}
          disabled={busy}
          onClick={() => answer.mutate(false)}
        >
          Deny
        </Button>
      </Group>
    </Stack>
  );
}
