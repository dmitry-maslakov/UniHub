import { Box, Loader } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/shared/ui';

// No course yet, as the account just linked is read for the first time:
// they come in a few minutes, and the page asks for them meanwhile.
// Announced as a status, as the list's loading is
export function FirstSyncState({ label }: { label: string }) {
  const { t } = useTranslation('courses');
  return (
    <Box component="output" display="block">
      <EmptyState
        icon={<Loader size="xs" />}
        title={t('list.firstSync.title', { label })}
      >
        {t('list.firstSync.body')}
      </EmptyState>
    </Box>
  );
}
