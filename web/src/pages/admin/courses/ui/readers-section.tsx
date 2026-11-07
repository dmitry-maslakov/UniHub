import { Badge, Button, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchClient, type Schemas } from '@/shared/api';
import {
  EmptyState,
  ListSkeleton,
  QueryState,
  Row,
  RowAction,
  RowList,
  RowText,
  Section,
} from '@/shared/ui';
import { invalidateHubCourses } from '../api/hub-courses';
import { readersQuery } from '../api/readers';
import { GrantForm } from './grant-form';

type Reader = Schemas['CourseReaderResponse'];

// Who is granted the course, and the form that grants another user
export function ReadersSection({ course }: { course: { id: string } }) {
  const { t } = useTranslation('admin');
  const { t: common } = useTranslation('common');
  const queryClient = useQueryClient();
  const readers = useQuery(readersQuery(course.id));
  const revoke = useMutation({
    mutationFn: ({ userId }: Reader) =>
      fetchClient.DELETE('/api/users/{userId}/courses/{courseId}', {
        params: { path: { userId, courseId: course.id } },
      }),
    onSuccess: async (_, { name }) => {
      notifications.show({ message: t('course.notify.revoked', { name }) });
      await Promise.all([
        invalidateHubCourses(queryClient),
        queryClient.invalidateQueries(readersQuery(course.id)),
      ]);
    },
    onError: () =>
      notifications.show({ color: 'red', message: t('course.failed') }),
  });

  const confirmRevoke = (reader: Reader) =>
    modals.openConfirmModal({
      title: t('course.readers.remove.confirm.title', { name: reader.name }),
      children: (
        <Text size="sm">{t('course.readers.remove.confirm.body')}</Text>
      ),
      labels: {
        confirm: t('course.readers.remove.confirm.action'),
        cancel: common('action.cancel'),
      },
      confirmProps: { color: 'red' },
      onConfirm: () => revoke.mutate(reader),
    });

  return (
    <Section
      title={t('course.readers.title')}
      description={t('course.readers.description')}
    >
      <QueryState
        query={readers}
        loading={<ListSkeleton rows={2} label={common('state.loading')} />}
        isEmpty={(data) => !data.length}
        empty={
          <EmptyState title={t('course.readers.empty.title')}>
            {t('course.readers.empty.body')}
          </EmptyState>
        }
      >
        {(data) => (
          <RowList label={t('course.readers.title')}>
            {data.map((reader) => (
              <Row key={reader.userId}>
                <RowText
                  title={reader.name}
                  badges={
                    reader.banned && (
                      <Badge color="red" variant="light">
                        {t('users.badge.banned')}
                      </Badge>
                    )
                  }
                  meta={[reader.email]}
                />
                <RowAction>
                  <Button
                    variant="subtle"
                    color="red"
                    size="sm"
                    aria-label={t('course.readers.remove.aria', {
                      name: reader.name,
                    })}
                    onClick={() => confirmRevoke(reader)}
                  >
                    {t('course.readers.remove.action')}
                  </Button>
                </RowAction>
              </Row>
            ))}
          </RowList>
        )}
      </QueryState>
      <GrantForm courseId={course.id} />
    </Section>
  );
}
