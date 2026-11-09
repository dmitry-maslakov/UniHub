import { SegmentedControl } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/_app/search');

// Files or posts alone, or both, kept in the address
export function SearchType({ type }: { type?: 'files' | 'posts' }) {
  const { t } = useTranslation('search');
  const navigate = route.useNavigate();
  return (
    <SegmentedControl
      size="sm"
      aria-label={t('type.aria')}
      value={type ?? 'all'}
      onChange={(next) =>
        void navigate({
          search: (s) => ({
            ...s,
            type: next === 'files' || next === 'posts' ? next : undefined,
          }),
          replace: true,
        })
      }
      data={[
        { value: 'all', label: t('type.all') },
        { value: 'files', label: t('type.files') },
        { value: 'posts', label: t('type.posts') },
      ]}
    />
  );
}
