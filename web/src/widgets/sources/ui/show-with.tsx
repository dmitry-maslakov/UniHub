import { NativeSelect } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Schemas } from '@/shared/api';
import { showWith } from '../api/picks';
import { ownCourses } from '../lib/own-courses';
import { showWithErrorText } from '../lib/pick-error';

// What a picked course shows with: on its own, or inside one of the user's
// courses they read through their own account, the one sharing files with
// it first and marked. None of the user's own, nothing to choose.
export function ShowWith({
  portal,
  course,
}: {
  portal: string;
  course: Schemas['CatalogCourseResponse'];
}) {
  const queryClient = useQueryClient();
  const courses = api.useQuery('get', '/api/courses');
  const move = useMutation({
    mutationFn: async (into: string | null) => {
      await showWith(portal, course.externalId, into);
    },
    onSuccess: () =>
      Promise.all(
        ['/api/portals/{portal}/catalog', '/api/courses'].map((path) =>
          queryClient.invalidateQueries({ queryKey: ['get', path] }),
        ),
      ),
    onError: (error) =>
      notifications.show({ color: 'red', message: showWithErrorText(error) }),
  });
  const own = ownCourses(courses.data ?? []);
  if (!own.length) return null;

  const suggested = own.find(({ slug }) => slug === course.suggestedInto);
  const rest = own.filter((c) => c !== suggested);
  const value = (move.isPending ? move.variables : course.into) ?? '';
  return (
    <NativeSelect
      label="Show with"
      description={
        suggested && value !== suggested.slug
          ? `${suggested.name} has some of the same files.`
          : undefined
      }
      size="sm"
      maw="24rem"
      disabled={move.isPending}
      value={value}
      onChange={(event) => move.mutate(event.currentTarget.value || null)}
      data={[
        { value: '', label: 'On its own' },
        ...(suggested
          ? [
              {
                group: 'Suggested',
                items: [{ value: suggested.slug, label: suggested.name }],
              },
            ]
          : []),
        ...(rest.length
          ? [
              {
                group: suggested ? 'Your other courses' : 'Your courses',
                items: rest.map(({ slug, name }) => ({
                  value: slug,
                  label: name,
                })),
              },
            ]
          : []),
      ]}
    />
  );
}
