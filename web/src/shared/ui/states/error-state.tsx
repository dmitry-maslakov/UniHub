import { Alert, Button, Stack, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { errorKind } from '@/shared/api';

// A load that failed: what happened by its cause, and a way to try again
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <Alert
      color="red"
      role="alert"
      title={t('error.title')}
      icon={<IconAlertCircle size={20} stroke={1.75} />}
    >
      <Stack gap="sm" align="flex-start">
        <Text size="sm">{t(`error.${errorKind(error)}`)}</Text>
        {onRetry && (
          <Button variant="default" size="sm" onClick={onRetry}>
            {t('action.tryAgain')}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
