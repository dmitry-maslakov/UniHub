import { Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchClient, type Schemas } from '@/shared/api';
import {
  EmptyState,
  Row,
  RowAction,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { invalidateHubCourses } from '../api/hub-courses';
import { LinkForm } from './link-form';

type Course = Schemas['HubCourseResponse'];
type Link = Course['links'][number];

// the academic year a portal course is for: 2026 is 2026/27
const span = (year: number) => ({
  from: year,
  to: String((year + 1) % 100).padStart(2, '0'),
});

// The portal courses a course gathers, each by where it comes from and who
// reads it, and the form that links another
export function LinksSection({ course }: { course: Course }) {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const queryClient = useQueryClient();
  const unlink = useMutation({
    mutationFn: ({ portal, externalId }: Link) =>
      fetchClient.DELETE('/api/portal-courses/{portal}/{externalId}/course', {
        params: { path: { portal, externalId } },
      }),
    onSuccess: async () => {
      notifications.show({ message: t('course.notify.unlinked') });
      await invalidateHubCourses(queryClient);
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('course.failed') }),
  });

  const confirmUnlink = (link: Link) =>
    modals.openConfirmModal({
      title: t('course.links.unlink.confirm.title', {
        name: link.name ?? link.externalId,
      }),
      children: <Text size="sm">{t('course.links.unlink.confirm.body')}</Text>,
      labels: {
        confirm: t('course.links.unlink.confirm.action'),
        cancel: common('action.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => unlink.mutate(link),
    });

  return (
    <Section
      title={t('course.links.title')}
      description={t('course.links.description')}
    >
      {course.links.length ? (
        <RowList label={t('course.links.aria')}>
          {course.links.map((link) => (
            <Row key={`${link.portal}/${link.instance}/${link.externalId}`}>
              <RowText
                title={link.name ?? link.externalId}
                meta={[
                  link.label,
                  link.instance && new URL(link.instance).host,
                  link.year
                    ? t('course.links.year', span(link.year))
                    : t('course.links.anyYear'),
                  link.mode === 'token' && t('course.links.ownAccounts'),
                  link.mode === 'public' && t('course.links.picked'),
                ]}
              />
              <RowAction>
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label={t('course.links.unlink.aria', {
                    name: link.name ?? link.externalId,
                  })}
                  onClick={() => confirmUnlink(link)}
                >
                  {t('course.links.unlink.action')}
                </Button>
              </RowAction>
            </Row>
          ))}
        </RowList>
      ) : (
        <EmptyState title={t('course.links.empty.title')}>
          {t('course.links.empty.body')}
        </EmptyState>
      )}
      <LinkForm course={course} />
    </Section>
  );
}
