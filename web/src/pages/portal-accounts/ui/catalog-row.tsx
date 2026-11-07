import { Anchor, Badge, Checkbox, Group } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Schemas } from '@/shared/api';
import { setPicked } from '../api/picks';
import { pickErrorText } from '../lib/pick-error';
import classes from './portal-catalog.module.css';

// One course of the catalog: a checkbox to pick it, and whether it's new.
// Checked as asked until the catalog, the count and the courses show it.
export function CatalogRow({
  portal,
  course,
}: {
  portal: string;
  course: Schemas['CatalogCourseResponse'];
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async (pick: boolean) => {
      await setPicked(portal, course.externalId, pick);
    },
    onSuccess: () =>
      Promise.all(
        [
          '/api/portals/{portal}/catalog',
          '/api/me/portals',
          '/api/courses',
        ].map((path) =>
          queryClient.invalidateQueries({ queryKey: ['get', path] }),
        ),
      ),
    onError: (error, pick) =>
      notifications.show({ color: 'red', message: pickErrorText(error, pick) }),
  });
  const picked = toggle.isPending ? toggle.variables : course.picked;

  return (
    <li className={classes.row}>
      <Group gap="xs" wrap="nowrap" align="flex-start" miw={0}>
        <Checkbox
          checked={picked}
          disabled={toggle.isPending}
          onChange={(event) => toggle.mutate(event.currentTarget.checked)}
          label={course.name}
          styles={{ label: { overflowWrap: 'anywhere' } }}
        />
        {course.isNew && (
          <Badge
            color="gray"
            variant="light"
            radius="sm"
            size="sm"
            tt="none"
            style={{ flexShrink: 0 }}
          >
            New
          </Badge>
        )}
      </Group>
      {course.url && (
        <Anchor
          href={course.url}
          target="_blank"
          rel="noreferrer"
          size="sm"
          c="dimmed"
          style={{ flexShrink: 0 }}
          aria-label={`Open ${course.name} on its site`}
        >
          Open
        </Anchor>
      )}
    </li>
  );
}
