import { NativeSelect, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { coursesQuery } from '@/entities/course';
import { errorCode, type Schemas } from '@/shared/api';
import { showWith } from '../api/picks';
import { linkedCourse, ownCourses } from '../lib/own-courses';
import { showWithErrorText } from '../lib/pick-error';

// What a picked course shows with: on its own, or inside one of the user's
// courses they read through their own account, the one sharing files with
// it first and marked. None of the user's own, nothing to choose; one an
// admin linked to a course stays there, and is named.
export function ShowWith({
  portal,
  course,
}: {
  portal: string;
  course: Schemas['CatalogCourseResponse'];
}) {
  const { t } = useTranslation('sources');
  const queryClient = useQueryClient();
  const courses = useQuery(coursesQuery());
  const refresh = () =>
    Promise.all(
      ['/api/portals/{portal}/catalog', '/api/courses'].map((path) =>
        queryClient.invalidateQueries({ queryKey: ['get', path] }),
      ),
    );
  const move = useMutation({
    mutationFn: async (into: string | null) => {
      await showWith(portal, course.externalId, into);
    },
    onSuccess: refresh,
    onError: (error) => {
      notifications.show({
        color: 'red',
        message: showWithErrorText(t, error),
      });
      // the course is no longer the user's own: what they see is read again
      if (errorCode(error) === 'NOT_YOUR_COURSE') void refresh();
    },
  });
  const linked = linkedCourse(courses.data ?? [], portal, course.externalId);
  if (linked)
    return (
      <Text size="sm" c="dimmed">
        {t('showWith.linked', { name: linked.name })}
      </Text>
    );
  const own = ownCourses(courses.data ?? []);
  if (!own.length) return null;

  const suggested = own.find(({ slug }) => slug === course.suggestedInto);
  const rest = own.filter((c) => c !== suggested);
  const value = (move.isPending ? move.variables : course.into) ?? '';
  return (
    <NativeSelect
      label={t('showWith.label')}
      description={
        suggested && value !== suggested.slug
          ? t('showWith.sameFiles', { name: suggested.name })
          : undefined
      }
      size="sm"
      maw="24rem"
      disabled={move.isPending}
      value={value}
      onChange={(event) => move.mutate(event.currentTarget.value || null)}
      data={[
        { value: '', label: t('showWith.alone') },
        ...(suggested
          ? [
              {
                group: t('showWith.suggested'),
                items: [{ value: suggested.slug, label: suggested.name }],
              },
            ]
          : []),
        ...(rest.length
          ? [
              {
                group: t(suggested ? 'showWith.others' : 'showWith.yours'),
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
