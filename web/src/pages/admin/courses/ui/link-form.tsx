import { Button, Group, NumberInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchClient, type Schemas } from '@/shared/api';
import { invalidateHubCourses } from '../api/hub-courses';
import { linkableQuery } from '../api/linkable';
import { type Option, RemoteSelect } from './remote-select';

type Linkable = Schemas['LinkablePortalCourseResponse'];
type Choice = Option & Pick<Linkable, 'portal' | 'externalId'>;

// Links a shared or public portal's course, found by name, to the course,
// for an academic year or for every one. A portal course linked to another
// course moves.
export function LinkForm({ course }: { course: { slug: string; id: string } }) {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Choice | null>(null);
  const [year, setYear] = useState<number | string>('');
  // a new select once something is linked
  const [round, setRound] = useState(0);
  const found = useQuery(linkableQuery(q));
  const items = useMemo<Choice[]>(
    () =>
      (found.data?.portalCourses ?? []).map((p) => ({
        value: JSON.stringify([p.portal, p.externalId]),
        portal: p.portal,
        externalId: p.externalId,
        label:
          p.course && p.course.id !== course.id
            ? t('course.links.form.option.elsewhere', {
                name: p.name,
                portal: p.label,
                course: p.course.name,
              })
            : t('course.links.form.option.plain', {
                name: p.name,
                portal: p.label,
              }),
      })),
    [found.data, course.id, t],
  );
  const link = useMutation({
    mutationFn: ({ portal, externalId }: Choice) =>
      fetchClient.PUT('/api/portal-courses/{portal}/{externalId}/course', {
        params: { path: { portal, externalId } },
        body: {
          course: course.slug,
          year: typeof year === 'number' ? year : null,
        },
      }),
    onSuccess: async () => {
      notifications.show({ message: t('course.notify.linked') });
      setChosen(null);
      setYear('');
      setRound((n) => n + 1);
      await Promise.all([
        invalidateHubCourses(queryClient),
        queryClient.invalidateQueries({
          queryKey: ['get', '/api/admin/portal-courses'],
        }),
      ]);
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('course.failed') }),
  });

  return (
    <Stack gap="xs">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (chosen) link.mutate(chosen);
        }}
      >
        <Group align="flex-end" wrap="wrap" gap="sm">
          <RemoteSelect
            key={round}
            label={t('course.links.form.label')}
            placeholder={t('course.links.form.placeholder')}
            nothing={t('course.links.form.nothing')}
            items={items}
            fetching={found.isFetching}
            failed={found.isError}
            chosen={chosen}
            onChoose={setChosen}
            onQuery={setQ}
          />
          <NumberInput
            label={t('course.links.form.year.label')}
            placeholder={t('course.links.form.year.placeholder')}
            min={1901}
            max={2999}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            w={140}
            value={year}
            onChange={setYear}
          />
          <Button
            variant="default"
            type="submit"
            disabled={!chosen}
            loading={link.isPending}
          >
            {t('course.links.form.action')}
          </Button>
        </Group>
      </form>
      <Text size="sm" c="dimmed" maw="60ch">
        {t('course.links.form.moves')}
      </Text>
      <Text size="sm" c="dimmed" maw="60ch">
        {t('course.links.form.picks')}
      </Text>
    </Stack>
  );
}
