import { Pill } from '@mantine/core';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useCourseName } from '@/entities/course';

const route = getRouteApi('/_app/search');

// The course a search is limited to, which one click widens to all.
// A course named by its initials gives them back to the words it took them from.
export function SearchScope({
  course,
  from,
}: {
  course: string;
  from?: string;
}) {
  const { t } = useTranslation('search');
  const courseName = useCourseName(course);
  const navigate = route.useNavigate();
  return (
    <Pill
      size="md"
      withRemoveButton
      // Mantine hides a pill's button from keyboards and screen readers (it
      // serves the pills input); this one is the only way to widen
      removeButtonProps={{
        'aria-label': t('scope.remove'),
        'aria-hidden': false,
        tabIndex: 0,
      }}
      onRemove={() =>
        void navigate({
          search: (s) => ({
            ...s,
            q: from ?? s.q,
            course: undefined,
            from: undefined,
          }),
          replace: true,
        })
      }
    >
      {t('scope.course', { name: courseName })}
    </Pill>
  );
}
