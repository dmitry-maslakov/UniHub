import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { setHidden } from '../api/set-hidden';

// what a course's hiding changes: the courses, the course itself, and of a
// public site's course its pick, which the catalog and the sources count
const CHANGED = [
  '/api/courses',
  '/api/courses/{slug}',
  '/api/me/portals',
  '/api/portals/{portal}/catalog',
];

// Hides a course from My courses, or shows a hidden one there again; `long`
// says where it shows it, for a place that isn't My courses
export function HideCourseButton({
  slug,
  name,
  hidden,
  long = false,
}: {
  slug: string;
  name: string;
  hidden: boolean;
  long?: boolean;
}) {
  const { t } = useTranslation('courses');
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: async () => {
      await setHidden(slug, !hidden);
    },
    onSuccess: () =>
      Promise.all(
        CHANGED.map((path) =>
          queryClient.invalidateQueries({ queryKey: ['get', path] }),
        ),
      ),
    onError: () =>
      notifications.show({
        color: 'red',
        message: t(hidden ? 'hide.showFailed' : 'hide.failed'),
      }),
  });
  return (
    <Button
      variant="subtle"
      size="compact-sm"
      loading={change.isPending}
      onClick={() => change.mutate()}
      aria-label={t(hidden ? 'hide.showAria' : 'hide.aria', { name })}
    >
      {t(hidden ? (long ? 'hide.showLong' : 'hide.show') : 'hide.action')}
    </Button>
  );
}
