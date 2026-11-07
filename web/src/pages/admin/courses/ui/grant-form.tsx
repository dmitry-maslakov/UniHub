import { Button, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient } from '@/shared/api';
import { invalidateHubCourses } from '../api/hub-courses';
import { candidatesQuery, readersQuery } from '../api/readers';
import { type Option, RemoteSelect } from './remote-select';

type Candidate = Option & { name: string };

// Gives a user, found by email or name, access to the course
export function GrantForm({ courseId }: { courseId: string }) {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Candidate | null>(null);
  // a new select once someone is given access
  const [round, setRound] = useState(0);
  const found = useQuery(candidatesQuery(q));
  const items = useMemo<Candidate[]>(
    () =>
      (found.data?.users ?? []).map((u) => ({
        value: u.id,
        name: u.name,
        label: `${u.name} · ${u.email}`,
      })),
    [found.data],
  );
  const grant = useMutation({
    mutationFn: ({ value: userId }: Candidate) =>
      fetchClient.PUT('/api/users/{userId}/courses/{courseId}', {
        params: { path: { userId, courseId } },
      }),
    onSuccess: async (_, { name }) => {
      notifications.show({ message: t('course.notify.granted', { name }) });
      setChosen(null);
      setRound((n) => n + 1);
      await Promise.all([
        invalidateHubCourses(queryClient),
        queryClient.invalidateQueries(readersQuery(courseId)),
      ]);
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('course.failed') }),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (chosen) grant.mutate(chosen);
      }}
    >
      <Group align="flex-end" wrap="wrap" gap="sm">
        <RemoteSelect
          key={round}
          label={t('course.readers.form.label')}
          placeholder={t('course.readers.form.placeholder')}
          nothing={t('course.readers.form.nothing')}
          items={items}
          fetching={found.isFetching}
          failed={found.isError}
          chosen={chosen}
          onChoose={setChosen}
          onQuery={setQ}
        />
        <Button
          variant="default"
          type="submit"
          disabled={!chosen}
          loading={grant.isPending}
        >
          {t('course.readers.form.action')}
        </Button>
      </Group>
    </form>
  );
}
