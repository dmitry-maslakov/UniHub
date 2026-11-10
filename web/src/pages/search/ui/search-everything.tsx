import { Checkbox } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/_app/search');

// Whether a search of all courses looks past the ones in My courses: into
// the hidden ones and the public sites' not picked. Kept in the address.
export function SearchEverything({ all }: { all?: '1' }) {
  const { t } = useTranslation('search');
  const navigate = route.useNavigate();
  return (
    <Checkbox
      size="sm"
      label={t('everything')}
      checked={all === '1'}
      onChange={(event) =>
        void navigate({
          search: (s) => ({
            ...s,
            all: event.currentTarget.checked ? ('1' as const) : undefined,
          }),
          replace: true,
        })
      }
    />
  );
}
