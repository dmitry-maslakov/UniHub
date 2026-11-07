import { Anchor, Badge, Checkbox, Group, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, type Schemas } from '@/shared/api';
import { webAddress } from '@/shared/lib';
import { Row, RowAction } from '@/shared/ui';
import { setPicked } from '../api/picks';
import { pickErrorText } from '../lib/pick-error';
import classes from './portal-catalog.module.css';
import { ShowWith } from './show-with';

// One course of the catalog: a checkbox to pick it, and whether it's new;
// once picked, what it shows with. Checked as asked until the catalog, the
// count and the courses show it.
export function CatalogRow({
  portal,
  course,
}: {
  portal: string;
  course: Schemas['CatalogCourseResponse'];
}) {
  const { t } = useTranslation('sources');
  const queryClient = useQueryClient();
  const refresh = (paths: string[]) =>
    Promise.all(
      paths.map((path) =>
        queryClient.invalidateQueries({ queryKey: ['get', path] }),
      ),
    );
  const toggle = useMutation({
    mutationFn: async (pick: boolean) => {
      await setPicked(portal, course.externalId, pick);
    },
    onSuccess: () =>
      refresh([
        '/api/portals/{portal}/catalog',
        '/api/me/portals',
        '/api/courses',
      ]),
    onError: (error, pick) => {
      notifications.show({
        color: 'red',
        message: pickErrorText(t, error, pick),
      });
      // a course the catalog no longer has: the catalog is read again
      if (error instanceof ApiError && error.status === 404)
        void refresh(['/api/portals/{portal}/catalog']);
    },
  });
  const picked = toggle.isPending ? toggle.variables : course.picked;
  // what the site's connector sent: a link only if it's a web address
  const address = webAddress(course.url);

  return (
    <Row>
      <Stack gap="sm" miw={0} style={{ flex: '1 1 14rem' }}>
        <Group gap="xs" wrap="nowrap" align="flex-start" miw={0}>
          <Checkbox
            checked={picked}
            disabled={toggle.isPending}
            onChange={(event) => toggle.mutate(event.currentTarget.checked)}
            label={course.name}
            styles={{ label: { overflowWrap: 'anywhere' } }}
          />
          {course.isNew && (
            <Badge style={{ flexShrink: 0 }}>{t('catalog.new')}</Badge>
          )}
        </Group>
        {course.picked && !toggle.isPending && (
          <div className={classes.showWith}>
            <ShowWith portal={portal} course={course} />
          </div>
        )}
      </Stack>
      {address && (
        <RowAction>
          <Anchor
            href={address}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            c="dimmed"
            aria-label={t('catalog.openAria', { name: course.name })}
          >
            {t('catalog.open')}
          </Anchor>
        </RowAction>
      )}
    </Row>
  );
}
