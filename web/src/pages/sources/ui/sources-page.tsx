import { useTranslation } from 'react-i18next';
import { PageTitle } from '@/shared/ui';
import { SourceCards } from '@/widgets/sources';

export function SourcesPage() {
  const { t } = useTranslation('sources');
  return (
    <>
      <PageTitle description={t('description')}>{t('title')}</PageTitle>
      <SourceCards order={2} />
    </>
  );
}
