import { Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { AnchorLink, NotFoundState } from '@/shared/ui';

export function NotFoundPage() {
  const { t } = useTranslation('shell');
  return (
    <Box component="main" maw="25rem" mx="auto" px="md" py="xxl">
      <NotFoundState
        title={t('notFound.title')}
        description={t('notFound.description')}
        back={<AnchorLink to="/">{t('notFound.home')}</AnchorLink>}
      />
    </Box>
  );
}
